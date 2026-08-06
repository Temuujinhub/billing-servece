import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import { decryptSecret } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProviderInvoiceResult, PaymentProviderPort, ProviderPaymentStatus } from './payment-provider.port';

/**
 * Bonum Gateway (psp.bonum.mn) ecommerce adapter — verified against the
 * official docs (Bonum Gateway APIs / Postman documenter 2sB2cYbzu8).
 *
 * Environments (§1): testing https://testapi.bonum.mn, production
 * https://apis.bonum.mn.
 *
 * Contract summary:
 *  • Auth (§2): GET /bonum-gateway/ecommerce/auth/create with headers
 *    `Authorization: AppSecret {APP_SECRET}` + `X-TERMINAL-ID: {terminalId}`.
 *    RATE LIMITED ("Use previous token. Do not get token too frequently") —
 *    token cached until expiresIn, refreshed via GET auth/refresh with
 *    `Authorization: Bearer {refreshToken}`. Single-flight per terminal.
 *  • Create invoice (§3.2): POST /bonum-gateway/ecommerce/invoices
 *    {amount, callback, transactionId, expiresIn, items?} →
 *    {invoiceId, followUpLink}. The payer is redirected to followUpLink;
 *    `callback` is where the BROWSER returns after payment (our pay page) —
 *    the server-to-server webhook URL is pre-registered on the Bonum side.
 *  • Status (§3.3): GET /invoices/{invoiceId} is TESTING ONLY — production
 *    truth is the checksum-validated webhook (§7). We keep the status call as
 *    a best-effort backstop for missed webhooks.
 *  • Webhook (§7): POST with `x-checksum-v2` header =
 *    hex(HMAC-SHA256(rawBody, MERCHANT_CHECKSUM_KEY)). A valid checksum makes
 *    the webhook cryptographically authenticated → authoritative.
 *
 * MULTI-TENANT: tenant бүр Bonum дээр ӨӨРИЙН терминал/данстай тул credentials
 * нь tenant бүрд тусдаа (Tenant.bonum*, нууц нь AES-256-GCM шифрлэгдсэн);
 * env credentials нь платформын өөрийн (fallback) терминал.
 *
 * Bonum links are short-lived (we set expiresIn = BONUM_LINK_TTL_MINUTES).
 * We never SMS a Bonum link — the payer gets OUR short link, and a fresh
 * Bonum invoice is (re)created on demand after expiry (PaymentsService).
 */

const PATH_AUTH_CREATE = '/bonum-gateway/ecommerce/auth/create';
const PATH_AUTH_REFRESH = '/bonum-gateway/ecommerce/auth/refresh';
const PATH_INVOICES = '/bonum-gateway/ecommerce/invoices';

interface TokenState {
  accessToken: string;
  /** unix seconds */
  accessExpiresAt: number;
  refreshToken: string | null;
  refreshExpiresAt: number;
}

interface BonumCreds {
  terminalId: string;
  appSecret: string;
  checksumKey: string | null;
}

/** Parsed §7 webhook message (PAYMENT type). */
export interface BonumWebhook {
  type: string;
  status: string;
  /** body.status — "PAID" on real payment completion. */
  paid: boolean;
  invoiceId: string | null;
  transactionId: string | null;
  amount: number | null;
  completedAt: Date | null;
  invoiceStatus: string | null;
}

/** How long resolved tenant credentials are cached in-memory. */
const CREDS_CACHE_MS = 60_000;

@Injectable()
export class BonumAdapter implements PaymentProviderPort {
  readonly code = 'bonum';
  private readonly logger = new Logger(BonumAdapter.name);
  /** terminalId → cached token; single-flight per terminal (rate limit!). */
  private readonly tokens = new Map<string, TokenState>();
  private readonly tokenFlights = new Map<string, Promise<string>>();
  /** tenantId → resolved creds (short cache; '' key = env fallback). */
  private readonly credsCache = new Map<string, { creds: BonumCreds; at: number }>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get baseUrl(): string {
    return (this.config.get<string>('BONUM_BASE_URL') ?? 'https://apis.bonum.mn').replace(/\/$/, '');
  }

  private get lang(): string {
    return this.config.get<string>('BONUM_LANG') ?? 'mn';
  }

  /** Invoice/link lifetime we request from Bonum (expiresIn, seconds). */
  private get linkTtlSeconds(): number {
    return (Number(this.config.get('BONUM_LINK_TTL_MINUTES')) || 60) * 60;
  }

  // ------------------------------------------------------------- credentials

  private envCreds(): BonumCreds {
    const terminalId = this.config.get<string>('BONUM_TERMINAL_ID');
    const appSecret = this.config.get<string>('BONUM_APP_SECRET');
    if (!terminalId || !appSecret) {
      throw new Error('Bonum is not configured (BONUM_TERMINAL_ID / BONUM_APP_SECRET, and no tenant credentials set)');
    }
    return { terminalId, appSecret, checksumKey: this.config.get<string>('BONUM_CHECKSUM_KEY') ?? null };
  }

  /**
   * Tenant-ийн өөрийн терминал байвал түүнийг, үгүй бол env (платформын)
   * терминалыг ашиглана. Нууцууд DB-д шифрлэгдсэн — энд тайлна.
   */
  async resolveCreds(tenantId?: string): Promise<BonumCreds> {
    const cacheKey = tenantId ?? '';
    const cached = this.credsCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CREDS_CACHE_MS) return cached.creds;

    let creds: BonumCreds | null = null;
    if (tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { bonumTerminalId: true, bonumAppSecretEnc: true, bonumChecksumKeyEnc: true },
      });
      if (tenant?.bonumTerminalId && tenant.bonumAppSecretEnc) {
        const key = this.config.getOrThrow<string>('ENCRYPTION_KEY');
        creds = {
          terminalId: tenant.bonumTerminalId,
          appSecret: decryptSecret(key, tenant.bonumAppSecretEnc),
          checksumKey: tenant.bonumChecksumKeyEnc ? decryptSecret(key, tenant.bonumChecksumKeyEnc) : null,
        };
      }
    }
    creds = creds ?? this.envCreds();
    this.credsCache.set(cacheKey, { creds, at: Date.now() });
    return creds;
  }

  /** Tenant credential өөрчлөгдөхөд кэшийг хүчингүй болгоно (PATCH /tenant). */
  invalidateCreds(tenantId: string) {
    this.credsCache.delete(tenantId);
  }

  // ------------------------------------------------------------------ auth

  private async getAccessToken(creds: BonumCreds): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const cached = this.tokens.get(creds.terminalId);
    if (cached && cached.accessExpiresAt - 60 > now) {
      return cached.accessToken;
    }
    // Single-flight per terminal — §2: "Do not get token too frequently".
    let flight = this.tokenFlights.get(creds.terminalId);
    if (!flight) {
      flight = this.fetchToken(creds).finally(() => {
        this.tokenFlights.delete(creds.terminalId);
      });
      this.tokenFlights.set(creds.terminalId, flight);
    }
    return flight;
  }

  private async fetchToken(creds: BonumCreds): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    // Prefer refresh while the refresh token lives — cheaper vs the rate limit.
    const cached = this.tokens.get(creds.terminalId);
    if (cached?.refreshToken && cached.refreshExpiresAt - 60 > now) {
      try {
        const res = await fetch(`${this.baseUrl}${PATH_AUTH_REFRESH}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${cached.refreshToken}`, 'Accept-Language': this.lang },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          const text = await res.text();
          if (text) return this.storeToken(creds.terminalId, JSON.parse(text));
          // Docs show no response body for refresh — fall through to auth/create.
        } else {
          this.logger.warn(`Bonum token refresh failed (${res.status}); falling back to auth/create`);
        }
      } catch (e: any) {
        this.logger.warn(`Bonum token refresh error: ${e?.message}`);
      }
    }

    // §2 Get Token: Authorization: AppSecret {APP_SECRET} + X-TERMINAL-ID.
    const res = await fetch(`${this.baseUrl}${PATH_AUTH_CREATE}`, {
      method: 'GET',
      headers: {
        Authorization: `AppSecret ${creds.appSecret}`,
        'X-TERMINAL-ID': creds.terminalId,
        'Accept-Language': this.lang,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429) {
      // Rate limited but a still-valid token may exist — reuse it if possible.
      if (cached && cached.accessExpiresAt > now) return cached.accessToken;
      throw new Error('Bonum auth rate limited (429) and no cached token available');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Bonum auth failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const token = this.storeToken(creds.terminalId, await res.json());
    this.logger.log(`Bonum access token acquired (terminal ${creds.terminalId})`);
    return token;
  }

  /** §2 response: {tokenType, accessToken, expiresIn, refreshToken, refreshExpiresIn, unit: "SECONDS"}. */
  private storeToken(terminalId: string, body: any): string {
    if (!body?.accessToken) {
      throw new Error(`Bonum auth returned no accessToken: ${JSON.stringify(body).slice(0, 200)}`);
    }
    const now = Math.floor(Date.now() / 1000);
    this.tokens.set(terminalId, {
      accessToken: String(body.accessToken),
      accessExpiresAt: now + (Number(body.expiresIn) || 1800),
      refreshToken: body.refreshToken ? String(body.refreshToken) : null,
      refreshExpiresAt: now + (Number(body.refreshExpiresIn) || 0),
    });
    return String(body.accessToken);
  }

  private async request<T>(creds: BonumCreds, method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken(creds);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Accept-Language': this.lang,
        Accept: 'application/json',
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
    if (res.status === 401) {
      // Token invalidated server-side — drop the cache; the next call re-auths.
      this.tokens.delete(creds.terminalId);
    }
    if (!res.ok) {
      throw new Error(`Bonum ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    }
    return json as T;
  }

  // --------------------------------------------------------------- invoice

  async createInvoice(args: {
    amount: number;
    description: string;
    internalRef: string;
    returnUrl?: string;
    tenantId?: string;
  }): Promise<CreateProviderInvoiceResult> {
    const creds = await this.resolveCreds(args.tenantId);
    const publicUrl = (this.config.get<string>('PUBLIC_URL') ?? '').replace(/\/$/, '');
    // §3.2 transactionId: unique per invoice, 1–80 chars. Random suffix keeps
    // regenerated links from colliding for the same intent.
    const transactionId = `${args.internalRef.replace(/-/g, '')}${randomBytes(4).toString('hex')}`.slice(0, 80);
    const expiresIn = this.linkTtlSeconds;

    const body: any = await this.request(creds, 'POST', PATH_INVOICES, {
      amount: args.amount,
      // §3.2 `callback` is the BROWSER redirect after checkout — our pay page.
      // The server-to-server webhook URL is pre-registered on the Bonum side.
      callback: args.returnUrl ?? publicUrl,
      transactionId,
      expiresIn,
      items: [{ title: args.description.slice(0, 120) || 'Нэхэмжлэх', amount: args.amount, count: 1 }],
    });

    if (!body?.invoiceId) {
      throw new Error(`Bonum invoice create returned no invoiceId: ${JSON.stringify(body).slice(0, 300)}`);
    }
    return {
      providerInvoiceId: String(body.invoiceId),
      // No QR in the ecommerce flow — the hosted followUpLink page offers QPAY.
      qrText: '',
      paymentUrl: body.followUpLink ? String(body.followUpLink) : undefined,
      deeplinks: [],
      // We set expiresIn ourselves, so expiry is deterministic on our side.
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  /**
   * §3.3 GET /invoices/{invoiceId} is documented TESTING ONLY — production
   * truth is the checksum-validated webhook. This stays as a best-effort
   * backstop for missed webhooks (poll path); parse defensively since the
   * docs publish no response schema.
   */
  async getPaymentStatus(providerInvoiceId: string, tenantId?: string): Promise<ProviderPaymentStatus> {
    const creds = await this.resolveCreds(tenantId);
    const body: any = await this.request(creds, 'GET', `${PATH_INVOICES}/${encodeURIComponent(providerInvoiceId)}`);

    const inner = body?.body ?? body?.data ?? body;
    const paymentStatus = String(inner?.status ?? body?.status ?? '').toUpperCase();
    const paid = paymentStatus === 'PAID' || (String(body?.status ?? '').toUpperCase() === 'SUCCESS' && String(inner?.status ?? '').toUpperCase() === 'PAID');
    if (!paid) return { paid: false };

    const gross = Math.round(Number(inner?.amount) || 0);
    const completedAt = inner?.completedAt ? new Date(inner.completedAt) : new Date();
    return {
      paid: true,
      // transactionId эргэж ирэхгүй байж болзошгүй — invoiceId нь intent бүрд
      // цор ганц тул идемпотентлог хадгална.
      providerPaymentId: String(inner?.transactionId ?? providerInvoiceId),
      gross: gross || undefined,
      fee: 0,
      paidAt: Number.isNaN(completedAt.getTime()) ? new Date() : completedAt,
    };
  }

  /** §3-д cancel endpoint байхгүй — invoice нь өөрийн expiresIn-ээр дуусна. */
  async cancelInvoice(providerInvoiceId: string, _tenantId?: string): Promise<void> {
    this.logger.debug(`Bonum invoice ${providerInvoiceId} left to expire (no cancel API)`);
  }

  /** Bonum-д рефандын API байхгүй — буцаалтыг гараар (банкаар) хийнэ. */
  async refundPayment(_providerPaymentId: string, _tenantId?: string, _note?: string): Promise<void> {
    throw new Error('Bonum рефандын API байхгүй — буцаалтыг Bonum-ийн мерчант портал/банкаар гүйцэтгэнэ.');
  }

  // --------------------------------------------------------------- webhook

  /**
   * §7 Checksum Validation: hex(HMAC-SHA256(rawBody, MERCHANT_CHECKSUM_KEY))
   * compared against the `x-checksum-v2` header. Key is per-tenant (own
   * terminal), env key is the fallback. A VALID checksum authenticates the
   * webhook cryptographically → it may be treated as payment truth (§3.3
   * forbids the status endpoint in production).
   */
  async verifyChecksum(rawBody: string, provided: string | undefined, tenantId?: string): Promise<{ valid: boolean; scheme?: string }> {
    let key: string | null = null;
    try {
      key = (await this.resolveCreds(tenantId)).checksumKey;
    } catch {
      key = this.config.get<string>('BONUM_CHECKSUM_KEY') ?? null;
    }
    if (!key) return { valid: false, scheme: 'unconfigured' };
    if (!provided) return { valid: false };
    const digest = createHmac('sha256', key).update(rawBody, 'utf8').digest('hex');
    return digest === provided.trim().toLowerCase() ? { valid: true, scheme: 'hmac-sha256-v2' } : { valid: false };
  }

  /** Parse a §3.4/§7 PAYMENT webhook payload into a typed struct. */
  parseWebhook(payload: any): BonumWebhook | null {
    if (!payload || typeof payload !== 'object') return null;
    const body = payload.body ?? {};
    const completedAt = body.completedAt ? new Date(body.completedAt) : null;
    return {
      type: String(payload.type ?? ''),
      status: String(payload.status ?? ''),
      paid: String(payload.status ?? '').toUpperCase() === 'SUCCESS' && String(body.status ?? 'PAID').toUpperCase() === 'PAID',
      invoiceId: body.invoiceId ? String(body.invoiceId) : null,
      transactionId: body.transactionId ? String(body.transactionId) : null,
      amount: body.amount !== undefined ? Math.round(Number(body.amount) || 0) : null,
      completedAt: completedAt && !Number.isNaN(completedAt.getTime()) ? completedAt : null,
      invoiceStatus: body.invoiceStatus ? String(body.invoiceStatus) : null,
    };
  }
}
