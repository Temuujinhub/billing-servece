import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

@Injectable()
export class EbarimtOperatorService {
  private readonly logger = new Logger(EbarimtOperatorService.name);
  private token: TokenState | null = null;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return (this.config.get<string>('EBARIMT_OPR_BASE_URL') ?? 'https://api.ebarimt.mn').replace(/\/$/, '');
  }

  private get apiKey(): string | null {
    return this.config.get<string>('EBARIMT_OPR_API_KEY') ?? null;
  }

  /** Операторын эрх тохируулагдсан эсэх — UI товчийг үүгээр асаана. */
  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Нэгдсэн нэвтрэлтийн (OpenID Connect) токен. Тохируулаагүй бол null —
   * зарим орчинд зөвхөн X-API-KEY хангалттай тул хүсэлтийг зогсоохгүй.
   */
  private async bearer(): Promise<string | null> {
    const fixed = this.config.get<string>('EBARIMT_OPR_TOKEN');
    if (fixed) return fixed;

    const url = this.config.get<string>('EBARIMT_OIDC_TOKEN_URL');
    const clientId = this.config.get<string>('EBARIMT_OIDC_CLIENT_ID');
    const clientSecret = this.config.get<string>('EBARIMT_OIDC_CLIENT_SECRET');
    if (!url || !clientId || !clientSecret) return null;

    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.expiresAt - 60 > now) return this.token.token;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        this.logger.warn(`ebarimt OIDC token failed (${res.status})`);
        return null;
      }
      const body: any = await res.json();
      if (!body?.access_token) return null;
      this.token = { token: String(body.access_token), expiresAt: now + (Number(body.expires_in) || 300) };
      return this.token.token;
    } catch (e: any) {
      this.logger.warn(`ebarimt OIDC token error: ${e?.message}`);
      return null;
    }
  }

  private async post(path: string, body: unknown): Promise<OperatorRequestResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      return {
        ok: false,
        status: null,
        message_mn: 'Операторын API түлхүүр (EBARIMT_OPR_API_KEY) серверт тохируулаагүй байна.',
        details: [],
      };
    }
    const bearer = await this.bearer();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
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

  /** Мерчант (борлуулагч) бүртгэх хүсэлт: нэг POS дээр нэг буюу хэд хэдэн ТТД. */
  async registerMerchants(posNo: string, merchantTins: string[]): Promise<OperatorRequestResult> {
    return this.post(PATH_SAVE_MERCHANTS, { posNo, merchantTins });
  }

  /** Түрээслэгч бүртгэх хүсэлт: биет нь ТТД-ийн энгийн жагсаалт. */
  async registerLessors(merchantTins: string[]): Promise<OperatorRequestResult> {
    return this.post(PATH_SAVE_LESSORS, merchantTins);
  }
}
