import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { CreateProviderInvoiceResult, PaymentProviderPort, ProviderPaymentStatus } from './payment-provider.port';

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
 * QPay Merchant V2 adapter (merchant.qpay.mn) — Media Professional LLC contract.
 *
 * Provider rules implemented per the official spec:
 *  • Token is fetched ONCE and cached until its timestamp expiry; refreshed via
 *    /v2/auth/refresh, never re-requested in a loop (spec warning).
 *  • Payments are never trusted from the callback alone — /v2/payment/check is
 *    the authority (spec: "callback авсаны дараа check хийнэ үү").
 *  • The callback endpoint must answer HTTP 200 body "SUCCESS" (spec sheet).
 */
@Injectable()
export class QpayAdapter implements PaymentProviderPort {
  readonly code = 'qpay';
  private readonly logger = new Logger(QpayAdapter.name);
  private token: TokenState | null = null;
  private tokenFlight: Promise<string> | null = null;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return (this.config.get<string>('QPAY_BASE_URL') ?? 'https://merchant.qpay.mn').replace(/\/$/, '');
  }

  // ------------------------------------------------------------------ auth

  private async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.accessExpiresAt - 60 > now) {
      return this.token.accessToken;
    }
    // Single-flight: concurrent requests share one token fetch.
    if (!this.tokenFlight) {
      this.tokenFlight = this.fetchToken(now).finally(() => {
        this.tokenFlight = null;
      });
    }
    return this.tokenFlight;
  }

  private async fetchToken(now: number): Promise<string> {
    // Prefer refresh while the refresh token is still valid.
    if (this.token && this.token.refreshExpiresAt - 60 > now) {
      try {
        const res = await fetch(`${this.baseUrl}/v2/auth/refresh`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token.refreshToken}` },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          const body: any = await res.json();
          this.storeToken(body);
          return this.token!.accessToken;
        }
        this.logger.warn(`QPay refresh failed (${res.status}); falling back to full auth`);
      } catch (e: any) {
        this.logger.warn(`QPay refresh error: ${e?.message}`);
      }
    }

    const username = this.config.get<string>('QPAY_USERNAME');
    const password = this.config.get<string>('QPAY_PASSWORD');
    if (!username || !password) {
      throw new Error('QPay is not configured (QPAY_USERNAME / QPAY_PASSWORD)');
    }
    const res = await fetch(`${this.baseUrl}/v2/auth/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`QPay auth failed (${res.status}): ${text.slice(0, 200)}`);
    }
    this.storeToken(await res.json());
    this.logger.log('QPay access token acquired');
    return this.token!.accessToken;
  }

  private storeToken(body: any) {
    this.token = {
      accessToken: body.access_token,
      accessExpiresAt: Number(body.expires_in) || Math.floor(Date.now() / 1000) + 3000,
      refreshToken: body.refresh_token ?? '',
      refreshExpiresAt: Number(body.refresh_expires_in) || 0,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
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

  async createInvoice(args: { amount: number; description: string; internalRef: string }): Promise<CreateProviderInvoiceResult> {
    const invoiceCode = this.config.get<string>('QPAY_INVOICE_CODE');
    if (!invoiceCode) throw new Error('QPAY_INVOICE_CODE is not configured');
    const publicUrl = (this.config.get<string>('PUBLIC_URL') ?? '').replace(/\/$/, '');

    // Unique per attempt so re-tries never collide on sender_invoice_no.
    const senderInvoiceNo = `${args.internalRef.replace(/-/g, '').slice(0, 20)}${randomBytes(4).toString('hex')}`;

    const body: any = await this.request('POST', '/v2/invoice', {
      invoice_code: invoiceCode,
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

  async getPaymentStatus(providerInvoiceId: string): Promise<ProviderPaymentStatus> {
    const body: any = await this.request('POST', '/v2/payment/check', {
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

  async cancelInvoice(providerInvoiceId: string): Promise<void> {
    await this.request('DELETE', `/v2/invoice/${encodeURIComponent(providerInvoiceId)}`).catch((e) => {
      this.logger.warn(`QPay invoice cancel failed: ${e?.message}`);
    });
  }

  // --------------------------------------------------------------- ebarimt

  /** Create the tax receipt for a confirmed payment (QPay eBarimt integration). */
  async createEbarimt(paymentId: string, receiverType: 'CITIZEN' | 'COMPANY' = 'CITIZEN', receiver?: string): Promise<QpayEbarimtResult> {
    const body: any = await this.request('POST', '/v2/ebarimt/create', {
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
