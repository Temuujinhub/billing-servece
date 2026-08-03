import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptString, encryptString, maskSecret } from '../../common/crypto';
import { AuthUser } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';

export interface QpayEffectiveConfig {
  enabled: boolean;
  baseUrl: string;
  username: string;
  password: string;
  invoiceCode: string;
  source: 'db' | 'env' | 'none';
}

export interface CallproEffectiveConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  from: string;
  source: 'db' | 'env' | 'none';
}

const CACHE_TTL_MS = 30_000;
const CODES = ['QPAY', 'CALLPRO'] as const;
export type ProviderCode = (typeof CODES)[number];

/**
 * Tenant-level provider settings, editable from the dashboard (OWNER only).
 * Secrets are AES-256-GCM encrypted inside the JSON column. Environment
 * variables act as the platform fallback so existing deployments keep working
 * until a tenant saves their own credentials.
 */
@Injectable()
export class ProviderConfigService {
  private readonly logger = new Logger(ProviderConfigService.name);
  private readonly cache = new Map<string, { value: unknown; ts: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private cacheGet<T>(key: string): T | undefined {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.value as T;
    return undefined;
  }

  private cacheSet(key: string, value: unknown) {
    this.cache.set(key, { value, ts: Date.now() });
  }

  // ------------------------------------------------------------- effective

  async getQpay(tenantId: string): Promise<QpayEffectiveConfig> {
    const cacheKey = `QPAY:${tenantId}`;
    const cached = this.cacheGet<QpayEffectiveConfig>(cacheKey);
    if (cached) return cached;

    const row = await this.prisma.providerConfig.findUnique({
      where: { tenantId_code: { tenantId, code: 'QPAY' } },
    });
    let result: QpayEffectiveConfig;
    if (row) {
      const c = row.config as any;
      result = {
        enabled: row.enabled,
        baseUrl: c.baseUrl || 'https://merchant.qpay.mn',
        username: c.username || '',
        password: c.password ? decryptString(c.password) : '',
        invoiceCode: c.invoiceCode || '',
        source: 'db',
      };
    } else if (this.config.get('PAYMENT_PROVIDER') === 'qpay') {
      result = {
        enabled: true,
        baseUrl: this.config.get('QPAY_BASE_URL') ?? 'https://merchant.qpay.mn',
        username: this.config.get('QPAY_USERNAME') ?? '',
        password: this.config.get('QPAY_PASSWORD') ?? '',
        invoiceCode: this.config.get('QPAY_INVOICE_CODE') ?? '',
        source: 'env',
      };
    } else {
      result = { enabled: false, baseUrl: 'https://merchant.qpay.mn', username: '', password: '', invoiceCode: '', source: 'none' };
    }
    this.cacheSet(cacheKey, result);
    return result;
  }

  async getCallpro(tenantId: string): Promise<CallproEffectiveConfig> {
    const cacheKey = `CALLPRO:${tenantId}`;
    const cached = this.cacheGet<CallproEffectiveConfig>(cacheKey);
    if (cached) return cached;

    const row = await this.prisma.providerConfig.findUnique({
      where: { tenantId_code: { tenantId, code: 'CALLPRO' } },
    });
    let result: CallproEffectiveConfig;
    if (row) {
      const c = row.config as any;
      result = {
        enabled: row.enabled,
        baseUrl: c.baseUrl || 'https://api-text.callpro.mn/v1/sms',
        apiKey: c.apiKey ? decryptString(c.apiKey) : '',
        from: c.from || '',
        source: 'db',
      };
    } else if (this.config.get('SMS_PROVIDER') === 'callpro') {
      result = {
        enabled: true,
        baseUrl: this.config.get('CALLPRO_BASE_URL') ?? 'https://api-text.callpro.mn/v1/sms',
        apiKey: this.config.get('CALLPRO_API_KEY') ?? '',
        from: this.config.get('CALLPRO_FROM') ?? '',
        source: 'env',
      };
    } else {
      result = { enabled: false, baseUrl: 'https://api-text.callpro.mn/v1/sms', apiKey: '', from: '', source: 'none' };
    }
    this.cacheSet(cacheKey, result);
    return result;
  }

  // ------------------------------------------------------------- admin API

  /** Masked view for the dashboard — secrets never leave the server. */
  async list(tenantId: string) {
    const [qpay, callpro] = await Promise.all([this.getQpay(tenantId), this.getCallpro(tenantId)]);
    return {
      qpay: {
        code: 'QPAY',
        enabled: qpay.enabled,
        source: qpay.source,
        baseUrl: qpay.baseUrl,
        username: qpay.username,
        passwordMask: maskSecret(qpay.password),
        invoiceCode: qpay.invoiceCode,
        configured: Boolean(qpay.username && qpay.password && qpay.invoiceCode),
      },
      callpro: {
        code: 'CALLPRO',
        enabled: callpro.enabled,
        source: callpro.source,
        baseUrl: callpro.baseUrl,
        apiKeyMask: maskSecret(callpro.apiKey),
        from: callpro.from,
        configured: Boolean(callpro.apiKey && callpro.from),
      },
    };
  }

  async save(
    user: AuthUser,
    code: ProviderCode,
    dto: {
      enabled?: boolean;
      baseUrl?: string;
      username?: string;
      password?: string;
      invoiceCode?: string;
      apiKey?: string;
      from?: string;
    },
  ) {
    const existing = await this.prisma.providerConfig.findUnique({
      where: { tenantId_code: { tenantId: user.tenantId, code } },
    });
    const prev = (existing?.config as any) ?? {};

    let config: Record<string, unknown>;
    if (code === 'QPAY') {
      // Fall back to env values so enabling from the UI works even before the
      // tenant re-types credentials that already live in the server .env.
      const env = await this.getQpay(user.tenantId);
      config = {
        baseUrl: dto.baseUrl?.trim() || prev.baseUrl || env.baseUrl,
        username: dto.username?.trim() || prev.username || env.username,
        // Blank password field in the UI = keep the stored one.
        password: dto.password ? encryptString(dto.password) : (prev.password ?? (env.password ? encryptString(env.password) : undefined)),
        invoiceCode: dto.invoiceCode?.trim() || prev.invoiceCode || env.invoiceCode,
      };
      if (dto.enabled && !(config.username && config.password && config.invoiceCode)) {
        throw apiError(HttpStatus.BAD_REQUEST, 'INCOMPLETE_CONFIG', 'Username, password, invoice code гурвуулаа шаардлагатай.', 'username, password and invoiceCode are required to enable QPay.');
      }
    } else {
      const env = await this.getCallpro(user.tenantId);
      config = {
        baseUrl: dto.baseUrl?.trim() || prev.baseUrl || env.baseUrl,
        apiKey: dto.apiKey ? encryptString(dto.apiKey) : (prev.apiKey ?? (env.apiKey ? encryptString(env.apiKey) : undefined)),
        from: dto.from?.trim() || prev.from || env.from,
      };
      if (dto.enabled && !(config.apiKey && config.from)) {
        throw apiError(HttpStatus.BAD_REQUEST, 'INCOMPLETE_CONFIG', 'API key болон илгээгч дугаар шаардлагатай.', 'apiKey and from are required to enable CallPro.');
      }
    }

    await this.prisma.providerConfig.upsert({
      where: { tenantId_code: { tenantId: user.tenantId, code } },
      create: { tenantId: user.tenantId, code, enabled: dto.enabled ?? false, config: config as any },
      update: { enabled: dto.enabled ?? existing?.enabled ?? false, config: config as any },
    });
    this.cache.delete(`${code}:${user.tenantId}`);

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.userId,
        actorEmail: user.email,
        action: `integration.${code.toLowerCase()}.saved`,
        targetType: 'provider_config',
        targetId: code,
        meta: { enabled: dto.enabled ?? existing?.enabled ?? false }, // secrets never logged
      },
    });
    return this.list(user.tenantId);
  }

  /** Live connectivity test — returns status only, never credentials. */
  async test(tenantId: string, code: ProviderCode): Promise<{ ok: boolean; httpStatus: number | null; message_mn: string }> {
    try {
      if (code === 'QPAY') {
        const cfg = await this.getQpay(tenantId);
        if (!cfg.username || !cfg.password) {
          return { ok: false, httpStatus: null, message_mn: 'Credential тохируулаагүй байна.' };
        }
        const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/v2/auth/token`, {
          method: 'POST',
          headers: { Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}` },
          signal: AbortSignal.timeout(15_000),
        });
        return res.ok
          ? { ok: true, httpStatus: res.status, message_mn: 'QPay холболт амжилттай — token авагдлаа.' }
          : { ok: false, httpStatus: res.status, message_mn: `QPay ${res.status} буцаалаа — username/password шалгана уу.` };
      }
      const cfg = await this.getCallpro(tenantId);
      if (!cfg.apiKey) {
        return { ok: false, httpStatus: null, message_mn: 'API key тохируулаагүй байна.' };
      }
      // Try all three operators — the balance endpoint 404s on operators the
      // tenant has no allocation with, which is not a credential failure.
      let last = 0;
      for (const op of ['unitel', 'mobicom', 'skytel']) {
        const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/tenant-daily-message-count?operator=${op}`, {
          headers: { 'x-api-key': cfg.apiKey },
          signal: AbortSignal.timeout(15_000),
        });
        last = res.status;
        if (res.ok) {
          return { ok: true, httpStatus: res.status, message_mn: `CallPro холболт амжилттай (${op}).` };
        }
        if (res.status === 401) {
          return { ok: false, httpStatus: 401, message_mn: 'CallPro API key буруу байна.' };
        }
      }
      return {
        ok: false,
        httpStatus: last,
        message_mn: `CallPro ${last} буцаалаа — key хүчинтэй ч дугаарын оператор/эрх шалгах хэрэгтэй байж болзошгүй.`,
      };
    } catch (e: any) {
      this.logger.warn(`Provider test ${code} failed: ${e?.message}`);
      return { ok: false, httpStatus: null, message_mn: `Сүлжээний алдаа: ${String(e?.message).slice(0, 120)}` };
    }
  }
}
