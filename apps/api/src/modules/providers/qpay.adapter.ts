import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { CreateProviderInvoiceResult, PaymentProviderPort, ProviderPaymentStatus } from './payment-provider.port';
import { ProviderConfigService, QpayEffectiveConfig } from './provider-config.service';

interface TokenState {
  accessToken: string;
  /** unix seconds */
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
}

export interface QpayEbarimtResult {
  receiptNo: string;
  lottery: string | null;
  qrData: string | null;
  status: string;
}

/**
 * QPay Merchant V2 adapter (merchant.qpay.mn). Credentials come from the
 * tenant's saved integration settings (dashboard) with env fallback.
 *
 * Provider rules implemented per the official spec:
 *  • Token is fetched ONCE per credential set and cached until its timestamp
 *    expiry; refreshed via /v2/auth/refresh, never re-requested in a loop.
 *  • Payments are never trusted from the callback alone — /v2/payment/check is
 *    the authority (spec: "callback авсаны дараа check хийнэ үү").
 *  • The callback endpoint must answer HTTP 200 body "SUCCESS".
 */
@Injectable()
export class QpayAdapter implements PaymentProviderPort {
  readonly code = 'qpay';
  private readonly logger = new Logger(QpayAdapter.name);
  /** Token cache per username — different tenants may hold different contracts. */
  private readonly tokens = new Map<string, TokenState>();
  private readonly tokenFlights = new Map<string, Promise<string>>();

  constructor(
    private readonly config: ConfigService,
    private readonly providerConfigs: ProviderConfigService,
  ) {}

  private async cfg(tenantId: string): Promise<QpayEffectiveConfig> {
    const cfg = await this.providerConfigs.getQpay(tenantId);
    if (!cfg.username || !cfg.password || !cfg.invoiceCode) {
      throw new Error('QPay is not configured for this tenant');
    }
    return { ...cfg, baseUrl: cfg.baseUrl.replace(/\/$/, '') };
  }

  // ------------------------------------------------------------------ auth

  private async getAccessToken(cfg: QpayEffectiveConfig): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const cached = this.tokens.get(cfg.username);
    if (cached && cached.accessExpiresAt - 60 > now) {
      return cached.accessToken;
    }
    // Single-flight per credential set: concurrent requests share one fetch.
    let flight = this.tokenFlights.get(cfg.username);
    if (!flight) {
      flight = this.fetchToken(cfg, now).finally(() => {
        this.tokenFlights.delete(cfg.username);
      });
      this.tokenFlights.set(cfg.username, flight);
    }
    return flight;
  }

  private async fetchToken(cfg: QpayEffectiveConfig, now: number): Promise<string> {
    const cached = this.tokens.get(cfg.username);
    // Prefer refresh while the refresh token is still valid.
    if (cached && cached.refreshExpiresAt - 60 > now) {
      try {
        const res = await fetch(`${cfg.baseUrl}/v2/auth/refresh`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cached.refreshToken}` },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          const body: any = await res.json();
          return this.storeToken(cfg.username, body);
        }
        this.logger.warn(`QPay refresh failed (${res.status}); falling back to full auth`);
      } catch (e: any) {
        this.logger.warn(`QPay refresh error: ${e?.message}`);
      }
    }

    const res = await fetch(`${cfg.baseUrl}/v2/auth/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`QPay auth failed (${res.status}): ${text.slice(0, 200)}`);
    }
    this.logger.log(`QPay access token acquired for ${cfg.username}`);
    return this.storeToken(cfg.username, await res.json());
  }

  private storeToken(username: string, body: any): string {
    const state: TokenState = {
      accessToken: body.access_token,
      accessExpiresAt: Number(body.expires_in) || Math.floor(Date.now() / 1000) + 3000,
      refreshToken: body.refresh_token ?? '',
      refreshExpiresAt: Number(body.refresh_expires_in) || 0,
    };
    this.tokens.set(username, state);
    return state.accessToken;
  }

  private async request<T>(cfg: QpayEffectiveConfig, method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken(cfg);
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON */
    }
    if (!res.ok) {
      throw new Error(`QPay ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    }
    return json as T;
  }

  // --------------------------------------------------------------- invoice

  async createInvoice(args: {
    tenantId: string;
    amount: number;
    description: string;
    internalRef: string;
  }): Promise<CreateProviderInvoiceResult> {
    const cfg = await this.cfg(args.tenantId);
    const publicUrl = (this.config.get<string>('PUBLIC_URL') ?? '').replace(/\/$/, '');

    // Unique per attempt so re-tries never collide on sender_invoice_no.
    const senderInvoiceNo = `${args.internalRef.replace(/-/g, '').slice(0, 20)}${randomBytes(4).toString('hex')}`;

    const body: any = await this.request(cfg, 'POST', '/v2/invoice', {
      invoice_code: cfg.invoiceCode,
      sender_invoice_no: senderInvoiceNo,
      invoice_receiver_code: 'terminal',
      invoice_description: args.description.slice(0, 250),
      amount: args.amount,
      callback_url: `${publicUrl}/api/v1/webhooks/qpay/callback?intent=${encodeURIComponent(args.internalRef)}`,
    });

    if (!body?.invoice_id) {
      throw new Error(`QPay invoice create returned no invoice_id: ${JSON.stringify(body).slice(0, 300)}`);
    }
    return {
      providerInvoiceId: String(body.invoice_id),
      qrText: String(body.qr_text ?? ''),
      deeplinks: Array.isArray(body.urls)
        ? body.urls.map((u: any) => ({
            name: String(u.name ?? u.description ?? 'Банкны апп'),
            logo: u.logo ? String(u.logo) : undefined,
            link: String(u.link ?? ''),
          }))
        : [],
      // QPay dynamic invoices stay payable; we rotate the QR daily on our side.
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    };
  }

  async getPaymentStatus(providerInvoiceId: string, tenantId: string): Promise<ProviderPaymentStatus> {
    const cfg = await this.cfg(tenantId);
    const body: any = await this.request(cfg, 'POST', '/v2/payment/check', {
      object_type: 'INVOICE',
      object_id: providerInvoiceId,
      offset: { page_number: 1, page_limit: 100 },
    });
    const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
    const paidRows = rows.filter((r) => r?.payment_status === 'PAID');
    if (paidRows.length === 0) return { paid: false };
    const gross = paidRows.reduce((s, r) => s + Math.round(Number(r.payment_amount) || 0), 0);
    const fee = paidRows.reduce((s, r) => s + Math.round(Number(r.trx_fee) || 0), 0);
    return {
      paid: true,
      providerPaymentId: String(paidRows[0].payment_id),
      gross,
      fee,
      paidAt: new Date(),
    };
  }

  async cancelInvoice(providerInvoiceId: string, tenantId: string): Promise<void> {
    try {
      const cfg = await this.cfg(tenantId);
      await this.request(cfg, 'DELETE', `/v2/invoice/${encodeURIComponent(providerInvoiceId)}`);
    } catch (e: any) {
      this.logger.warn(`QPay invoice cancel failed: ${e?.message}`);
    }
  }

  async refundPayment(providerPaymentId: string, tenantId: string, note?: string): Promise<void> {
    const cfg = await this.cfg(tenantId);
    // QPay Merchant V2: DELETE /v2/payment/refund/{payment_id}
    await this.request(cfg, 'DELETE', `/v2/payment/refund/${encodeURIComponent(providerPaymentId)}`, note ? { note } : undefined);
  }

  /** Best-effort tax receipt cancellation after a refund. */
  async cancelEbarimt(tenantId: string, paymentId: string): Promise<void> {
    const cfg = await this.cfg(tenantId);
    await this.request(cfg, 'POST', '/v2/ebarimt/cancel', { payment_id: paymentId });
  }

  // --------------------------------------------------------------- ebarimt

  /** Create the tax receipt for a confirmed payment (QPay eBarimt integration). */
  async createEbarimt(
    tenantId: string,
    paymentId: string,
    receiverType: 'CITIZEN' | 'COMPANY' = 'CITIZEN',
    receiver?: string,
  ): Promise<QpayEbarimtResult> {
    const cfg = await this.cfg(tenantId);
    const body: any = await this.request(cfg, 'POST', '/v2/ebarimt/create', {
      payment_id: paymentId,
      ebarimt_receiver_type: receiverType,
      ...(receiver ? { ebarimt_receiver: receiver } : {}),
    });
    if (!body?.id) {
      throw new Error(`QPay ebarimt create returned no id: ${JSON.stringify(body).slice(0, 300)}`);
    }
    return {
      receiptNo: String(body.id),
      lottery: body.ebarimt_lottery ? String(body.ebarimt_lottery) : null,
      qrData: body.ebarimt_qr_data ? String(body.ebarimt_qr_data) : null,
      status: String(body.ebarimt_status ?? 'REGISTERED'),
    };
  }
}
