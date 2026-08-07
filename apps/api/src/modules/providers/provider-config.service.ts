import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptString, encryptString, maskSecret } from '../../common/crypto';
import { AuthUser } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { decryptSecret, encryptSecret } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { BonumAdapter } from './bonum.adapter';
import { PosApiEbarimtAdapter } from './posapi-ebarimt.adapter';

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

/**
 * Bonum төлбөрийн гарц. Нууцууд нь ProviderConfig JSON-д БИШ, Tenant хүснэгтийн
 * bonum* багануудад хадгалагдана (BonumAdapter шууд тэндээс уншдаг) — энд
 * зөвхөн асаах/унтраах төлөв ProviderConfig мөрөнд хадгалагдана.
 */
export interface BonumEffectiveConfig {
  enabled: boolean;
  baseUrl: string;
  terminalId: string;
  appSecret: string;
  checksumKey: string;
  source: 'db' | 'env' | 'none';
}

/**
 * eBarimt POS API 3.0 (локал instance). Компани бүр ТЕГ-т ӨӨРИЙН merchantTin +
 * тухайн POS-д олгогдсон posNo-той бүртгэлтэй байх ёстой — эдгээр нь Tenant
 * хүснэгтэд, идэвхжилт нь TenantModule('EBARIMT')-д хадгалагдана.
 */
export interface EbarimtEffectiveConfig {
  enabled: boolean;
  baseUrl: string;
  merchantTin: string;
  posNo: string;
  branchNo: string;
  districtCode: string;
  source: 'db' | 'env' | 'none';
}

const CACHE_TTL_MS = 30_000;
const CODES = ['QPAY', 'CALLPRO', 'BONUM', 'EBARIMT'] as const;
export type ProviderCode = (typeof CODES)[number];

/** Бүх интеграцийн хадгалах талбарууд (код бүр өөрийнхөө хэсгийг л уншина). */
export interface SaveProviderDto {
  enabled?: boolean;
  baseUrl?: string;
  // QPay
  username?: string;
  password?: string;
  invoiceCode?: string;
  // CallPro
  apiKey?: string;
  from?: string;
  // Bonum
  terminalId?: string;
  appSecret?: string;
  checksumKey?: string;
  // eBarimt POS API
  merchantTin?: string;
  posNo?: string;
  branchNo?: string;
  districtCode?: string;
}

/**
 * Шифрлэгдсэн утга тайлагдахгүй байх ганц шалтгаан нь ENCRYPTION_KEY солигдсон
 * явдал. Тэр үед админы хуудас 500 өгөх нь биш, "тохируулаагүй" гэж харагдаад
 * дахин оруулах боломж үлдэх нь зөв.
 */
function safeDecrypt(fn: () => string): string {
  try {
    return fn();
  } catch {
    return '';
  }
}

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
    private readonly bonum: BonumAdapter,
    private readonly posapi: PosApiEbarimtAdapter,
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

  /**
   * Bonum: credential нь Tenant багануудад, идэвхжилт нь ProviderConfig мөрөнд.
   * Мөр байхгүй үед credential байгаа эсэхээр шийднэ — өмнө нь энэ логикоор
   * ажиллаж байсан tenant-ууд UI нээхэд гэнэт унтарч болохгүй.
   */
  async getBonum(tenantId: string): Promise<BonumEffectiveConfig> {
    const cacheKey = `BONUM:${tenantId}`;
    const cached = this.cacheGet<BonumEffectiveConfig>(cacheKey);
    if (cached) return cached;

    const [tenant, row] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { bonumTerminalId: true, bonumAppSecretEnc: true, bonumChecksumKeyEnc: true },
      }),
      this.prisma.providerConfig.findUnique({ where: { tenantId_code: { tenantId, code: 'BONUM' } } }),
    ]);
    const baseUrl = this.config.get<string>('BONUM_BASE_URL') ?? 'https://apis.bonum.mn';

    let result: BonumEffectiveConfig;
    if (tenant?.bonumTerminalId && tenant.bonumAppSecretEnc) {
      const key = this.config.getOrThrow<string>('ENCRYPTION_KEY');
      result = {
        enabled: row ? row.enabled : true,
        baseUrl,
        terminalId: tenant.bonumTerminalId,
        appSecret: safeDecrypt(() => decryptSecret(key, tenant.bonumAppSecretEnc!)),
        checksumKey: tenant.bonumChecksumKeyEnc ? safeDecrypt(() => decryptSecret(key, tenant.bonumChecksumKeyEnc!)) : '',
        source: 'db',
      };
    } else if (this.config.get('BONUM_TERMINAL_ID') && this.config.get('BONUM_APP_SECRET')) {
      result = {
        enabled: row ? row.enabled : this.config.get('PAYMENT_PROVIDER') === 'bonum',
        baseUrl,
        terminalId: this.config.get<string>('BONUM_TERMINAL_ID') ?? '',
        appSecret: this.config.get<string>('BONUM_APP_SECRET') ?? '',
        checksumKey: this.config.get<string>('BONUM_CHECKSUM_KEY') ?? '',
        source: 'env',
      };
    } else {
      result = { enabled: false, baseUrl, terminalId: '', appSecret: '', checksumKey: '', source: 'none' };
    }
    this.cacheSet(cacheKey, result);
    return result;
  }

  /** eBarimt POS API 3.0 — tenant-ийн ТЕГ бүртгэл + локал instance-ийн хаяг. */
  async getEbarimt(tenantId: string): Promise<EbarimtEffectiveConfig> {
    const cacheKey = `EBARIMT:${tenantId}`;
    const cached = this.cacheGet<EbarimtEffectiveConfig>(cacheKey);
    if (cached) return cached;

    const [tenant, module] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { tin: true, ebarimtMerchantTin: true, ebarimtPosNo: true, ebarimtBranchNo: true, ebarimtDistrictCode: true },
      }),
      this.prisma.tenantModule.findUnique({ where: { tenantId_code: { tenantId, code: 'EBARIMT' } } }),
    ]);
    const merchantTin = tenant?.ebarimtMerchantTin || tenant?.tin || '';
    const posNo = tenant?.ebarimtPosNo || '';
    const result: EbarimtEffectiveConfig = {
      enabled: module?.enabled ?? false,
      baseUrl: this.config.get<string>('VAT_BASE_URL') ?? '',
      merchantTin,
      posNo: posNo || this.config.get<string>('EBARIMT_POS_NO') || '',
      branchNo: tenant?.ebarimtBranchNo || this.config.get<string>('EBARIMT_BRANCH_NO') || '001',
      districtCode: tenant?.ebarimtDistrictCode || this.config.get<string>('EBARIMT_DISTRICT_CODE') || '3505',
      source: tenant?.ebarimtMerchantTin || posNo ? 'db' : merchantTin ? 'env' : 'none',
    };
    this.cacheSet(cacheKey, result);
    return result;
  }

  // ------------------------------------------------------------- admin API

  /** Masked view for the dashboard — secrets never leave the server. */
  async list(tenantId: string) {
    const [qpay, callpro, bonum, ebarimt] = await Promise.all([
      this.getQpay(tenantId),
      this.getCallpro(tenantId),
      this.getBonum(tenantId),
      this.getEbarimt(tenantId),
    ]);
    return {
      bonum: {
        code: 'BONUM',
        enabled: bonum.enabled,
        source: bonum.source,
        baseUrl: bonum.baseUrl,
        terminalId: bonum.terminalId,
        appSecretMask: maskSecret(bonum.appSecret),
        checksumKeyMask: maskSecret(bonum.checksumKey),
        configured: Boolean(bonum.terminalId && bonum.appSecret),
        /** Webhook гарын үсэг шалгах түлхүүр — үүнгүй бол төлбөр баталгаажихгүй. */
        hasChecksumKey: Boolean(bonum.checksumKey),
      },
      ebarimt: {
        code: 'EBARIMT',
        enabled: ebarimt.enabled,
        source: ebarimt.source,
        baseUrl: ebarimt.baseUrl,
        merchantTin: ebarimt.merchantTin,
        posNo: ebarimt.posNo,
        branchNo: ebarimt.branchNo,
        districtCode: ebarimt.districtCode,
        configured: Boolean(ebarimt.baseUrl && ebarimt.merchantTin && ebarimt.posNo),
      },
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

  async save(user: AuthUser, code: ProviderCode, dto: SaveProviderDto) {
    if (code === 'BONUM') return this.saveBonum(user, dto);
    if (code === 'EBARIMT') return this.saveEbarimt(user, dto);

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

  /**
   * Bonum: терминал/нууц түлхүүрүүд Tenant багануудад AES-256-GCM-ээр
   * шифрлэгдэж хадгалагдана (BonumAdapter яг тэндээс уншдаг), идэвхжилт нь
   * ProviderConfig мөрөнд. Хоосон нууц талбар = хуучныг нь хэвээр үлдээ.
   */
  private async saveBonum(user: AuthUser, dto: SaveProviderDto) {
    const encKey = this.config.getOrThrow<string>('ENCRYPTION_KEY');
    const data: Record<string, string> = {};
    if (dto.terminalId?.trim()) data.bonumTerminalId = dto.terminalId.trim();
    if (dto.appSecret?.trim()) data.bonumAppSecretEnc = encryptSecret(encKey, dto.appSecret.trim());
    if (dto.checksumKey?.trim()) data.bonumChecksumKeyEnc = encryptSecret(encKey, dto.checksumKey.trim());
    if (Object.keys(data).length > 0) {
      await this.prisma.tenant.update({ where: { id: user.tenantId }, data });
      this.bonum.invalidateCreds(user.tenantId);
    }
    this.cache.delete(`BONUM:${user.tenantId}`);

    // Асаахаас өмнө credential бүрэн эсэхийг шалгана — дутуу байвал төлбөрийн
    // линк үүсэхгүй бөгөөд төлөгчид алдаа харагдана.
    const effective = await this.getBonum(user.tenantId);
    if (dto.enabled && !(effective.terminalId && effective.appSecret)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INCOMPLETE_CONFIG',
        'Терминалын дугаар болон нууц түлхүүр (App Secret) хоёулаа шаардлагатай.',
        'terminalId and appSecret are required to enable the payment gateway.',
      );
    }

    const existing = await this.prisma.providerConfig.findUnique({
      where: { tenantId_code: { tenantId: user.tenantId, code: 'BONUM' } },
    });
    const enabled = dto.enabled ?? existing?.enabled ?? false;
    await this.prisma.providerConfig.upsert({
      where: { tenantId_code: { tenantId: user.tenantId, code: 'BONUM' } },
      // Нууцууд Tenant багананд байгаа тул энэ JSON-д хэзээ ч секрет бичихгүй.
      create: { tenantId: user.tenantId, code: 'BONUM', enabled, config: { storage: 'tenant' } },
      update: { enabled },
    });
    this.cache.delete(`BONUM:${user.tenantId}`);

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.userId,
        actorEmail: user.email,
        action: 'integration.bonum.saved',
        targetType: 'provider_config',
        targetId: 'BONUM',
        meta: { enabled, credentialsChanged: Object.keys(data) }, // утга нь хэзээ ч логлогдохгүй
      },
    });
    return this.list(user.tenantId);
  }

  /**
   * eBarimt POS API 3.0: компанийн ТЕГ бүртгэл (merchantTin + тухайн POS-д
   * олгогдсон posNo) Tenant хүснэгтэд, идэвхжилт нь TenantModule-д. baseUrl нь
   * локал instance-ийн хаяг тул зөвхөн серверийн VAT_BASE_URL-аас уншина.
   */
  private async saveEbarimt(user: AuthUser, dto: SaveProviderDto) {
    const data: Record<string, string> = {};
    if (dto.merchantTin?.trim()) data.ebarimtMerchantTin = dto.merchantTin.trim();
    if (dto.posNo?.trim()) data.ebarimtPosNo = dto.posNo.trim();
    if (dto.branchNo?.trim()) data.ebarimtBranchNo = dto.branchNo.trim();
    if (dto.districtCode?.trim()) data.ebarimtDistrictCode = dto.districtCode.trim();
    if (Object.keys(data).length > 0) {
      await this.prisma.tenant.update({ where: { id: user.tenantId }, data });
    }
    this.cache.delete(`EBARIMT:${user.tenantId}`);

    const effective = await this.getEbarimt(user.tenantId);
    if (dto.enabled && !effective.baseUrl) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INCOMPLETE_CONFIG',
        'Баримтын үйлчилгээний хаяг (VAT_BASE_URL) серверт тохируулаагүй байна.',
        'VAT_BASE_URL is not configured on the server.',
      );
    }
    if (dto.enabled && !(effective.merchantTin && effective.posNo)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INCOMPLETE_CONFIG',
        'ТТД (merchantTin) болон POS дугаар хоёулаа шаардлагатай — эдгээрийг ТЕГ-ийн бүртгэлээр олгоно.',
        'merchantTin and posNo are required to enable eBarimt.',
      );
    }

    const enabled = dto.enabled ?? (await this.prisma.tenantModule.findUnique({
      where: { tenantId_code: { tenantId: user.tenantId, code: 'EBARIMT' } },
    }))?.enabled ?? false;
    await this.prisma.tenantModule.upsert({
      where: { tenantId_code: { tenantId: user.tenantId, code: 'EBARIMT' } },
      create: { tenantId: user.tenantId, code: 'EBARIMT', enabled },
      update: { enabled },
    });
    this.cache.delete(`EBARIMT:${user.tenantId}`);

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.userId,
        actorEmail: user.email,
        action: 'integration.ebarimt.saved',
        targetType: 'tenant_module',
        targetId: 'EBARIMT',
        meta: { enabled, changed: Object.keys(data) },
      },
    });
    return this.list(user.tenantId);
  }

  /** Live connectivity test — returns status only, never credentials. */
  async test(tenantId: string, code: ProviderCode): Promise<{ ok: boolean; httpStatus: number | null; message_mn: string }> {
    try {
      if (code === 'BONUM') {
        const res = await this.bonum.testConnection(tenantId);
        return { ...res, httpStatus: null };
      }
      if (code === 'EBARIMT') {
        const cfg = await this.getEbarimt(tenantId);
        if (!cfg.baseUrl) {
          return { ok: false, httpStatus: null, message_mn: 'Баримтын үйлчилгээний хаяг (VAT_BASE_URL) серверт тохируулаагүй байна.' };
        }
        const { tins, registered } = await this.posapi.checkRegistration(cfg.merchantTin || null);
        if (!cfg.merchantTin) {
          return { ok: true, httpStatus: 200, message_mn: `Баримтын үйлчилгээ ажиллаж байна (${tins.length} бүртгэлтэй ТТД). ТТД-гээ оруулна уу.` };
        }
        if (registered === false) {
          return {
            ok: false,
            httpStatus: 200,
            message_mn: `ТТД ${cfg.merchantTin} энэ баримтын серверт бүртгэгдээгүй байна — тухайн байгууллагыг ТЕГ-т өөрийн POS-оор нь эхэлж бүртгүүлнэ үү.`,
          };
        }
        return {
          ok: true,
          httpStatus: 200,
          message_mn:
            registered === null
              ? `Баримтын үйлчилгээ хариу өглөө. Бүртгэлийн жагсаалт ил гарахгүй байгаа тул ТТД ${cfg.merchantTin}-г туршилтын баримтаар шалгана уу.`
              : `Баримтын үйлчилгээ бэлэн — ТТД ${cfg.merchantTin} бүртгэгдсэн байна.`,
        };
      }
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
