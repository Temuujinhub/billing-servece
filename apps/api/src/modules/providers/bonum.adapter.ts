import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, createHash, randomBytes } from 'crypto';
import { decryptSecret } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProviderInvoiceResult, PaymentProviderPort, ProviderCallContext, ProviderPaymentStatus } from './payment-provider.port';

/**
 * Bonum Gateway (psp.bonum.mn) ecommerce adapter.
 *
 * Environments (doc §1): testing https://testapi.bonum.mn, production
 * https://apis.bonum.mn. Credentials: TERMINAL_ID + APP_SECRET (merchant
 * portal), MERCHANT_CHECKSUM_KEY (webhook verification).
 *
 * MULTI-TENANT: tenant бүр Bonum дээр ӨӨРИЙН мерчант бүртгэл, терминал,
 * дансаа холбуулдаг тул credentials нь tenant бүрд тусдаа (Tenant.bonum* —
 * нууц нь AES-256-GCM шифрлэгдсэн). Env credentials нь платформын өөрийн
 * (fallback) терминал. Token кэш терминал тус бүрээр хөтлөгдөнө.
 *
 * Provider rules implemented per the published guidelines:
 *  • Auth (doc §2, GET /bonum-gateway/ecommerce/auth/create) is RATE LIMITED —
 *    the token is fetched once per terminal, cached until expiry and shared
 *    across concurrent requests (single-flight), mirroring the QPay adapter.
 *  • Bonum payment links are short-lived on the provider side. We never SMS a
 *    Bonum link to a payer — the payer always receives OUR short link, and a
 *    fresh Bonum invoice/link is (re)created on demand when the payer opens
 *    the page after the previous one expired (see PaymentsService).
 *  • The webhook is only a trigger: payment truth always comes from the
 *    invoice-check API (same PAY-03 rule as QPay).
 *
 * NOTE(bonum-docs): this environment cannot reach psp.bonum.mn, so the exact
 * request/response field names below follow the doc's naming conventions but
 * MUST be verified against §2 Authentication / §3 Web Payment / §7 Webhooks
 * before go-live. Every provider-facing name is centralised in the constants
 * and `pick()` candidates below so corrections are one-line edits.
 */

// Endpoint paths (doc sidebar §2–§7). Verify against psp.bonum.mn.
const PATH_AUTH_CREATE = '/bonum-gateway/ecommerce/auth/create';
const PATH_AUTH_REFRESH = '/bonum-gateway/ecommerce/auth/refresh';
const PATH_INVOICE_CREATE = '/bonum-gateway/ecommerce/invoice/create';
const PATH_INVOICE_CHECK = '/bonum-gateway/ecommerce/invoice/check';
const PATH_INVOICE_CANCEL = '/bonum-gateway/ecommerce/invoice/cancel';

interface TokenState {
  accessToken: string;
  /** unix seconds */
  accessExpiresAt: number;
  refreshToken: string | null;
}

interface BonumCreds {
  terminalId: string;
  appSecret: string;
  checksumKey: string | null;
}

/** How long resolved tenant credentials are cached in-memory. */
const CREDS_CACHE_MS = 60_000;

/** Depth-first search for the first defined candidate key (handles `data`/`result` nesting). */
function pick(obj: any, keys: string[], depth = 3): any {
  if (!obj || typeof obj !== 'object' || depth < 0) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  for (const nested of ['data', 'result', 'response', 'body', 'invoice', 'payment']) {
    if (obj[nested] && typeof obj[nested] === 'object') {
      const v = pick(obj[nested], keys, depth - 1);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

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

  /** Provider-side link lifetime fallback when the response carries no expiry. */
  private get linkTtlMs(): number {
    return (Number(this.config.get('BONUM_LINK_TTL_MINUTES')) || 60) * 60_000;
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
    // Single-flight per terminal: the auth endpoint is rate limited (doc §2).
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
    // Prefer refresh when we hold a refresh token — cheaper against the rate limit.
    const cached = this.tokens.get(creds.terminalId);
    if (cached?.refreshToken) {
      try {
        const res = await fetch(`${this.baseUrl}${PATH_AUTH_REFRESH}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${cached.refreshToken}`, 'Accept-Language': this.lang },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          return this.storeToken(creds.terminalId, await res.json());
        }
        this.logger.warn(`Bonum token refresh failed (${res.status}); falling back to auth/create`);
      } catch (e: any) {
        this.logger.warn(`Bonum token refresh error: ${e?.message}`);
      }
    }

    // Doc §2: GET /bonum-gateway/ecommerce/auth/create with the portal-issued
    // APP_SECRET and terminalId. Header spelling variants are sent together so
    // the working one wins; servers ignore unknown headers.
    const res = await fetch(`${this.baseUrl}${PATH_AUTH_CREATE}`, {
      method: 'GET',
      headers: {
        'Accept-Language': this.lang,
        'app-secret': creds.appSecret,
        appsecret: creds.appSecret,
        'terminal-id': creds.terminalId,
        terminalid: creds.terminalId,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Bonum auth failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const token = this.storeToken(creds.terminalId, await res.json());
    this.logger.log(`Bonum access token acquired (terminal ${creds.terminalId})`);
    return token;
  }

  private storeToken(terminalId: string, body: any): string {
    const accessToken = pick(body, ['accessToken', 'access_token', 'token']);
    if (!accessToken) {
      throw new Error(`Bonum auth returned no access token: ${JSON.stringify(body).slice(0, 200)}`);
    }
    const expiresIn = Number(pick(body, ['expiresIn', 'expires_in', 'expiry'])) || 0;
    const now = Math.floor(Date.now() / 1000);
    this.tokens.set(terminalId, {
      accessToken: String(accessToken),
      // expires_in may be a TTL (seconds) or an absolute unix timestamp.
      accessExpiresAt: expiresIn > now ? expiresIn : now + (expiresIn || 3000),
      refreshToken: pick(body, ['refreshToken', 'refresh_token']) ?? null,
    });
    return String(accessToken);
  }

  private async request<T>(creds: BonumCreds, method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken(creds);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Accept-Language': this.lang,
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
    // Unique per attempt so regenerated links never collide on the order no.
    const orderId = `${args.internalRef.replace(/-/g, '').slice(0, 20)}${randomBytes(4).toString('hex')}`;

    const body: any = await this.request(creds, 'POST', PATH_INVOICE_CREATE, {
      terminalId: creds.terminalId,
      amount: args.amount,
      currency: 'MNT',
      orderId,
      description: args.description.slice(0, 250),
      // Payer lands back on OUR pay page after checkout (status poll confirms).
      redirectUri: args.returnUrl ?? publicUrl,
      // Registered webhook (emailed to Bonum) + per-invoice callback hint.
      callbackUrl: `${publicUrl}/api/v1/webhooks/bonum/callback?intent=${encodeURIComponent(args.internalRef)}`,
    });

    const invoiceId = pick(body, ['invoiceId', 'invoice_id', 'id', 'paymentId', 'transactionId']);
    if (!invoiceId) {
      throw new Error(`Bonum invoice create returned no invoice id: ${JSON.stringify(body).slice(0, 300)}`);
    }
    const paymentUrl = pick(body, ['checkoutUrl', 'paymentUrl', 'payment_url', 'link', 'url', 'redirectUrl']);
    const qrText = pick(body, ['qrText', 'qr_text', 'qr', 'qrData', 'qr_data']) ?? '';

    const rawExpiry = pick(body, ['expiresAt', 'expireDate', 'expire_date', 'expiryDate', 'dueDate']);
    const parsed = rawExpiry ? new Date(rawExpiry) : null;
    const expiresAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(Date.now() + this.linkTtlMs);

    return {
      providerInvoiceId: String(invoiceId),
      qrText: String(qrText),
      paymentUrl: paymentUrl ? String(paymentUrl) : undefined,
      deeplinks: [],
      expiresAt,
    };
  }

  async getPaymentStatus(providerInvoiceId: string, ctx?: ProviderCallContext): Promise<ProviderPaymentStatus> {
    const creds = await this.resolveCreds(ctx?.tenantId);
    const body: any = await this.request(creds, 'POST', PATH_INVOICE_CHECK, {
      terminalId: creds.terminalId,
      invoiceId: providerInvoiceId,
    });

    const status = String(pick(body, ['status', 'paymentStatus', 'payment_status', 'state', 'resultCode']) ?? '').toUpperCase();
    const paid = ['PAID', 'SUCCESS', 'SUCCEEDED', 'APPROVED', 'COMPLETED', 'DONE', '00'].includes(status);
    if (!paid) return { paid: false };

    const gross = Math.round(Number(pick(body, ['paidAmount', 'amount', 'totalAmount', 'gross'])) || 0);
    const fee = Math.round(Number(pick(body, ['fee', 'trxFee', 'commission'])) || 0);
    const paymentId = pick(body, ['paymentId', 'payment_id', 'transactionId', 'transaction_id', 'txnId']);
    const paidAtRaw = pick(body, ['paidAt', 'paidDate', 'paymentDate', 'settledAt']);
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
    return {
      paid: true,
      // Fall back to the invoice id — unique per intent, keeps idempotency intact.
      providerPaymentId: String(paymentId ?? providerInvoiceId),
      gross: gross || undefined,
      fee,
      paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
    };
  }

  async cancelInvoice(providerInvoiceId: string, ctx?: ProviderCallContext): Promise<void> {
    try {
      const creds = await this.resolveCreds(ctx?.tenantId);
      await this.request(creds, 'POST', PATH_INVOICE_CANCEL, {
        terminalId: creds.terminalId,
        invoiceId: providerInvoiceId,
      });
    } catch (e: any) {
      // Best-effort — expired links die on the provider side anyway.
      this.logger.warn(`Bonum invoice cancel failed: ${e?.message}`);
    }
  }

  // --------------------------------------------------------------- webhook

  /**
   * Verify the webhook checksum with the tenant's MERCHANT_CHECKSUM_KEY
   * (doc §7); env key is the fallback. Several common schemes are tried; the
   * result is used for logging/audit — payment truth still requires the
   * invoice-check call, so a scheme mismatch can never credit or lose money.
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
    const candidates: [string, string][] = [
      ['hmac-sha256', createHmac('sha256', key).update(rawBody).digest('hex')],
      ['sha256(body+key)', createHash('sha256').update(rawBody + key).digest('hex')],
      ['sha256(key+body)', createHash('sha256').update(key + rawBody).digest('hex')],
    ];
    const normalized = provided.trim().toLowerCase();
    for (const [scheme, digest] of candidates) {
      if (digest === normalized) return { valid: true, scheme };
    }
    return { valid: false };
  }
}
