import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptString } from '../../common/crypto';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ТЕГ-ийн ОПЕРАТОРЫН сервис — «Хэрэглэгчийн систем нийлүүлэгч» (оператор
 * компани) өөрийн системээс мерчант бүртгүүлэх хүсэлт үүсгэнэ:
 *
 *   POST {base}/api/tpi/receipt/saveOprMerchants
 *     headers: X-API-KEY (Posapi@itc.gov.mn-ээс авна) + Authorization: Bearer
 *     body:    { posNo, merchantTins: [...] }
 *     → { status, msg, code, data[] }
 *
 * Онбордингийн 4-р алхам: бид хүсэлтийг илгээнэ → байгууллага ebarimt.mn
 * дээрээ баталгаажуулна → /rest/info дээр гарч ирнэ (5, 6-р алхам).
 *
 * Хэсэгчилсэн амжилт БОЛОМЖТОЙ: status 201 үед `data` доторх мөр бүр нэг
 * merchantTin-ий шалтгааныг хэлнэ ("… хүлээгдэж байна", "… нэмэх боломжгүй").
 * Тиймээс бид 201-ийг алдаа гэж үзэхгүй, харин мөр бүрийг эргүүлэн харуулна.
 *
 * Тохиргоо (аль нэг нь дутуу бол сервис идэвхгүй — онбординг зогсохгүй):
 *   EBARIMT_OPR_BASE_URL   default https://api.ebarimt.mn
 *   EBARIMT_OPR_API_KEY    X-API-KEY
 *   EBARIMT_OPR_TOKEN      Bearer токен (эсвэл доорх OIDC-ээр авна)
 *   EBARIMT_OIDC_TOKEN_URL + EBARIMT_OIDC_CLIENT_ID + EBARIMT_OIDC_CLIENT_SECRET
 */
const PATH_SAVE_MERCHANTS = '/api/tpi/receipt/saveOprMerchants';
const PATH_SAVE_LESSORS = '/api/tpi/receipt/saveOprLessors';

export interface OperatorRequestResult {
  ok: boolean;
  status: number | null;
  message_mn: string;
  /** ТЕГ-ээс ирсэн мөр бүрийн тайлбар (merchantTin бүрд нэг). */
  details: string[];
}

interface TokenState {
  token: string;
  expiresAt: number;
}

export type OperatorRegisterKind = 'merchants' | 'lessors' | 'both';

interface OperatorSettings {
  apiKey?: string; // encrypted at rest
  posNo?: string;
  baseUrl?: string;
  /** ТЕГ-т аль API-аар бүртгэх вэ: saveOprMerchants | saveOprLessors | хоёулаа. */
  registerKind?: OperatorRegisterKind;
  // OIDC password grant (ТЕГ-ийн нэгдсэн нэвтрэлт) — админ UI-аас тохируулна.
  tokenUrl?: string;
  clientId?: string;
  username?: string;
  password?: string; // encrypted at rest
}

@Injectable()
export class EbarimtOperatorService {
  private readonly logger = new Logger(EbarimtOperatorService.name);
  private token: TokenState | null = null;
  private settingsCache: { value: OperatorSettings; ts: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Админ UI-аас хадгалсан тохиргоо (PlatformSetting 'ebarimtOperator') — env-ээс тэргүүлнэ. */
  private async settings(): Promise<OperatorSettings> {
    if (this.settingsCache && Date.now() - this.settingsCache.ts < 30_000) return this.settingsCache.value;
    const row = await this.prisma.platformSetting.findUnique({ where: { key: 'ebarimtOperator' } }).catch(() => null);
    const value = (row?.value as OperatorSettings) ?? {};
    this.settingsCache = { value, ts: Date.now() };
    return value;
  }

  /** Тохиргоо шинэчлэгдмэгц кэш хүчингүй болно (админ хадгалахад дуудагдана). */
  invalidateSettings() {
    this.settingsCache = null;
    this.token = null;
  }

  private async effectiveBaseUrl(): Promise<string> {
    const s = await this.settings();
    return (s.baseUrl || this.config.get<string>('EBARIMT_OPR_BASE_URL') || 'https://api.ebarimt.mn').replace(/\/$/, '');
  }

  private async effectiveApiKey(): Promise<string | null> {
    const s = await this.settings();
    if (s.apiKey) {
      try {
        return decryptString(s.apiKey);
      } catch {
        this.logger.warn('ebarimtOperator.apiKey тайлагдсангүй (ENCRYPTION_KEY солигдсон?) — env fallback');
      }
    }
    return this.config.get<string>('EBARIMT_OPR_API_KEY') || null;
  }

  /** Админ тохиргоо эсвэл env-ийн операторын POS дугаар. */
  async configuredPosNo(): Promise<string | null> {
    const s = await this.settings();
    return s.posNo || this.config.get<string>('EBARIMT_OPR_POS_NO') || null;
  }

  /** Операторын эрх тохируулагдсан эсэх — UI товчийг үүгээр асаана. */
  async isEnabled(): Promise<boolean> {
    return Boolean(await this.effectiveApiKey());
  }

  /**
   * Нэгдсэн нэвтрэлтийн (OpenID Connect) токен. Тохируулаагүй бол null —
   * зарим орчинд зөвхөн X-API-KEY хангалттай тул хүсэлтийг зогсоохгүй.
   */
  private async bearer(): Promise<string | null> {
    const fixed = this.config.get<string>('EBARIMT_OPR_TOKEN');
    if (fixed) return fixed;

    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.expiresAt - 60 > now) return this.token.token;

    // 1) Админ UI-аас тохируулсан ТЕГ-ийн нэгдсэн нэвтрэлт (password grant,
    //    гарын авлагын 21-р бүлэг: production realm = ITC, client_id = vatps).
    const s = await this.settings();
    if (s.username && s.password) {
      let password = '';
      try {
        password = decryptString(s.password);
      } catch {
        this.logger.warn('ebarimtOperator.password тайлагдсангүй (ENCRYPTION_KEY солигдсон?)');
      }
      if (password) {
        const result = await this.fetchToken({
          url: s.tokenUrl || 'https://auth.itc.gov.mn/auth/realms/ITC/protocol/openid-connect/token',
          form: {
            grant_type: 'password',
            client_id: s.clientId || 'vatps',
            username: s.username,
            password,
          },
        });
        if (result.ok) return this.token!.token;
        this.logger.warn(`ebarimt password-grant token failed: ${result.message}`);
      }
    }

    // 2) env-ийн client_credentials (хуучин зам — хэвээр дэмжинэ).
    const url = this.config.get<string>('EBARIMT_OIDC_TOKEN_URL');
    const clientId = this.config.get<string>('EBARIMT_OIDC_CLIENT_ID');
    const clientSecret = this.config.get<string>('EBARIMT_OIDC_CLIENT_SECRET');
    if (!url || !clientId || !clientSecret) return null;
    const result = await this.fetchToken({
      url,
      form: { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret },
    });
    return result.ok ? this.token!.token : null;
  }

  /** Токен татаж кэшлэнэ — амжилт/алдааг бүтэцтэй буцаана (тест товчинд ч ашиглана). */
  private async fetchToken(args: { url: string; form: Record<string, string> }): Promise<{ ok: boolean; message: string; expiresIn?: number }> {
    const now = Math.floor(Date.now() / 1000);
    try {
      const res = await fetch(args.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(args.form),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text();
      let body: any = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        /* non-JSON */
      }
      if (!res.ok || !body?.access_token) {
        const reason = body?.error_description || body?.error || text.slice(0, 150) || `HTTP ${res.status}`;
        return { ok: false, message: `${res.status}: ${reason}` };
      }
      const expiresIn = Number(body.expires_in) || 300;
      this.token = { token: String(body.access_token), expiresAt: now + expiresIn };
      return { ok: true, message: 'OK', expiresIn };
    } catch (e: any) {
      return { ok: false, message: String(e?.message ?? e).slice(0, 150) };
    }
  }

  /** Админы «Токен шалгах» товч: кэш үл харгалзан шинээр токен авч үзнэ. */
  async testToken(): Promise<{ ok: boolean; message_mn: string; expiresIn?: number }> {
    const s = await this.settings();
    if (s.username && s.password) {
      let password = '';
      try {
        password = decryptString(s.password);
      } catch {
        return { ok: false, message_mn: 'Нууц үг тайлагдсангүй (ENCRYPTION_KEY солигдсон байж магадгүй) — дахин оруулна уу.' };
      }
      this.token = null;
      const r = await this.fetchToken({
        url: s.tokenUrl || 'https://auth.itc.gov.mn/auth/realms/ITC/protocol/openid-connect/token',
        form: { grant_type: 'password', client_id: s.clientId || 'vatps', username: s.username, password },
      });
      return r.ok
        ? { ok: true, message_mn: `Токен амжилттай авлаа (хүчинтэй ${r.expiresIn} сек).`, expiresIn: r.expiresIn }
        : { ok: false, message_mn: `Токен авч чадсангүй — ${r.message}. Username/password болон орчноо (production = auth.itc.gov.mn) шалгана уу.` };
    }
    if (this.config.get<string>('EBARIMT_OPR_TOKEN')) {
      return { ok: true, message_mn: 'Тогтмол токен (EBARIMT_OPR_TOKEN) env-д тохируулагдсан байна.' };
    }
    return { ok: false, message_mn: 'Нэвтрэх нэр/нууц үг тохируулаагүй байна — доорх талбаруудад оруулаад хадгална уу.' };
  }

  private async post(path: string, body: unknown): Promise<OperatorRequestResult> {
    const apiKey = await this.effectiveApiKey();
    if (!apiKey) {
      return {
        ok: false,
        status: null,
        message_mn: 'Операторын API түлхүүр тохируулаагүй байна — Админ → Интеграци → «ТЕГ операторын эрх» хэсэгт оруулна уу.',
        details: [],
      };
    }
    const bearer = await this.bearer();
    let res: Response;
    try {
      res = await fetch(`${await this.effectiveBaseUrl()}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e: any) {
      return { ok: false, status: null, message_mn: `ТЕГ-ийн сервис хариу өгсөнгүй: ${String(e?.message ?? e).slice(0, 160)}`, details: [] };
    }

    const text = await res.text();
    let parsed: any = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON */
    }
    const details = Array.isArray(parsed?.data) ? parsed.data.map((d: unknown) => String(d)) : [];
    if (!res.ok) {
      const hint = res.status === 401 ? ' (API түлхүүр эсвэл токен буруу)' : '';
      return { ok: false, status: res.status, message_mn: `Хүсэлт амжилтгүй (${res.status})${hint}: ${text.slice(0, 200)}`, details };
    }
    // 200 = бүрэн, 201 = зарим нь илгээгдээгүй (шалтгаан нь `data` дотор).
    const status = Number(parsed?.status) || res.status;
    return {
      ok: true,
      status,
      message_mn: String(parsed?.msg ?? 'Хүсэлт илгээгдлээ.'),
      details,
    };
  }

  /** Операторын гэрээгээр аль бүртгэлийн API хэрэглэхийг админ сонгосон нь. */
  async registerKind(): Promise<OperatorRegisterKind> {
    const s = await this.settings();
    return s.registerKind === 'lessors' || s.registerKind === 'both' ? s.registerKind : 'merchants';
  }

  /** Мерчант (борлуулагч) бүртгэх хүсэлт: нэг POS дээр нэг буюу хэд хэдэн ТТД. */
  async registerMerchants(posNo: string, merchantTins: string[]): Promise<OperatorRequestResult> {
    return this.post(PATH_SAVE_MERCHANTS, { posNo, merchantTins });
  }

  /** Түрээслэгч бүртгэх хүсэлт: биет нь ТТД-ийн энгийн жагсаалт. */
  async registerLessors(merchantTins: string[]): Promise<OperatorRequestResult> {
    return this.post(PATH_SAVE_LESSORS, merchantTins);
  }
}
