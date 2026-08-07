import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EbarimtCreateArgs, EbarimtCreateResult, EbarimtPort } from './ebarimt.port';

/**
 * ТЕГ eBarimt POS API 3.0 adapter — LIME-ээр дамжуулан суулгасан ЛОКАЛ instance.
 *
 * VAT_BASE_URL нь ТЕГ-ийн нийтийн API БИШ: энэ нь өөрийн сервер дээр (Docker)
 * ажиллаж буй POS API 3.0 үйлчилгээ. Урьдчилсан нөхцөл:
 *   1. Тухайн tenant компани ТЕГ-т ӨӨРИЙН merchantTin + тэр POS-д олгогдсон
 *      posNo-той бүртгэлтэй байх (LIME-ийн posNo-г өөр компанид ашиглахгүй).
 *   2. GET {VAT_BASE_URL}/rest/info — бүртгэл (merchants, тохируулсан TIN-үүд)
 *      зөв эсэхийг адаптер ажиллуулахын өмнө шалгана (энд lazy шалгадаг).
 *
 * Receipt lifecycle: POST /rest/receipt (create) → GET /rest/sendData
 * (best-effort push to ТЕГ; the service also syncs on its own schedule).
 */
@Injectable()
export class PosApiEbarimtAdapter implements EbarimtPort {
  readonly code = 'ebarimt_posapi';
  private readonly logger = new Logger(PosApiEbarimtAdapter.name);
  /** TINs confirmed registered on the local instance (from /rest/info). */
  private registeredTins: Set<string> | null = null;
  private infoFlight: Promise<Set<string> | null> | null = null;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    const v = this.config.get<string>('VAT_BASE_URL');
    if (!v) throw new Error('eBarimt POS API is not configured (VAT_BASE_URL)');
    return v.replace(/\/$/, '');
  }

  /** Env defaults; tenants override per receipt (multi-merchant instance). */
  private merchantConfig(override?: EbarimtCreateArgs['merchant']) {
    const merchantTin = override?.merchantTin || this.config.get<string>('EBARIMT_MERCHANT_TIN');
    const posNo = override?.posNo || this.config.get<string>('EBARIMT_POS_NO');
    if (!merchantTin || !posNo) {
      throw new Error('eBarimt POS registration missing: set tenant ebarimtMerchantTin/ebarimtPosNo or EBARIMT_MERCHANT_TIN/EBARIMT_POS_NO');
    }
    return {
      merchantTin,
      posNo,
      branchNo: override?.branchNo || this.config.get<string>('EBARIMT_BRANCH_NO') || '001',
      districtCode: override?.districtCode || this.config.get<string>('EBARIMT_DISTRICT_CODE') || '3505',
    };
  }

  // ------------------------------------------------------------------ info

  /** GET /rest/info — merchants/branches registered on this local instance. */
  async info(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/rest/info`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`POS API /rest/info failed (${res.status})`);
    return res.json();
  }

  /**
   * Админы «Холболт шалгах»: /rest/info-г ШИНЭЭР татаад тухайн компанийн
   * merchantTin ТЕГ-т бүртгэгдсэн эсэхийг хэлнэ. Кэшийг мөн шинэчилнэ, тиймээс
   * шинэ компани бүртгүүлсний дараа энэ товч дарахад л хүчинтэй болно.
   */
  async checkRegistration(merchantTin?: string | null): Promise<{ tins: string[]; registered: boolean | null }> {
    const tins = collectTins(await this.info());
    this.registeredTins = tins;
    const list = [...tins];
    if (!merchantTin) return { tins: list, registered: null };
    // Хоосон бүртгэл нь "мэдэхгүй" — instance нь TIN-үүдээ ил гаргадаггүй байж болно.
    return { tins: list, registered: tins.size === 0 ? null : tins.has(merchantTin) };
  }

  /**
   * Онбордингийн сүүлийн алхам: хэрэглэгч ebarimt.mn дээрээ операторын хүсэлтийг
   * баталгаажуулсны дараа тухайн байгууллагын POS-ууд /rest/info дээр гарч ирдэг.
   * Үүнийг татаад `branchNo` / `posNo`-г автоматаар олгоно — хэрэглэгчээс
   * 8 оронтой дугаар гараар бичүүлэх шаардлагагүй.
   *
   * Байгууллагад хэд хэдэн POS бүртгэлтэй байж болно (жишээ нь 10025383,
   * 10045952). Баримт бүрд ЗӨВХӨН НЭГ posNo дамжуулна — бид эхнийхийг сонгож,
   * үлдсэнийг нь сонголт болгож UI руу буцаана.
   */
  async discoverRegistration(merchantTin?: string | null): Promise<{
    options: PosRegistration[];
    /** merchantTin өгсөн үед: тухайн ТТД-д харьяалагдах POS олдсон эсэх. */
    matched: boolean;
  }> {
    const body = await this.info();
    this.registeredTins = collectTins(body);
    const all = collectPosRegistrations(body);
    if (!merchantTin) return { options: all, matched: false };
    const mine = all.filter((r) => r.merchantTin === merchantTin);
    // Тухайн ТТД-гээр олдвол зөвхөн түүнийг — өөр байгууллагын POS дугаарыг
    // санамсаргүй санал болгож болохгүй (ТЕГ-ийн журмаар хориотой).
    return mine.length > 0 ? { options: mine, matched: true } : { options: [], matched: false };
  }

  /** Lazily collect registered TINs; null = info unavailable (don't block). */
  private async getRegisteredTins(): Promise<Set<string> | null> {
    if (this.registeredTins) return this.registeredTins;
    if (!this.infoFlight) {
      this.infoFlight = this.info()
        .then((body) => {
          const tins = collectTins(body);
          this.registeredTins = tins;
          this.logger.log(`POS API instance ready — ${tins.size} registered TIN(s)`);
          return tins;
        })
        .catch((e) => {
          this.logger.warn(`POS API /rest/info unavailable: ${e?.message}`);
          return null;
        })
        .finally(() => {
          this.infoFlight = null;
        });
    }
    return this.infoFlight;
  }

  // --------------------------------------------------------------- receipt

  async createReceipt(args: EbarimtCreateArgs): Promise<EbarimtCreateResult> {
    const merchant = this.merchantConfig(args.merchant);

    // Registration guard (заавар §3): a receipt for an unregistered TIN fails
    // anyway — fail early with an actionable message instead.
    const tins = await this.getRegisteredTins();
    if (tins && tins.size > 0 && !tins.has(merchant.merchantTin)) {
      throw new Error(
        `merchantTin ${merchant.merchantTin} is not registered on the POS API instance (${this.baseUrl}/rest/info) — register the company first`,
      );
    }

    const total = round2(args.amount);
    const isB2B = args.receiptType === 'ORGANIZATION' && !!args.customerTin;

    // Татварын төрөл нь БОРЛУУЛАГЧИЙН бүртгэлээс шалтгаална (getInfo?tin=).
    // НӨАТ суутган төлөгч биш байгууллагад 10% задалж бичих нь буруу баримт.
    const taxType = args.merchant?.vatFreeProject
      ? 'VAT_FREE'
      : args.merchant?.vatPayer === false
        ? 'NO_VAT'
        : 'VAT_ABLE';
    // Дүн нь НӨАТ шингэсэн; VAT_ABLE үед л 10%-ийг задалж харуулна.
    const vat = taxType === 'VAT_ABLE' ? round2(total - total / 1.1) : 0;

    const item: Record<string, unknown> = {
      name: args.description.slice(0, 128) || 'Үйлчилгээ',
      barCodeType: 'UNDEFINED',
      classificationCode: this.config.get<string>('EBARIMT_CLASSIFICATION_CODE') || '6499999',
      // НӨАТ-аас чөлөөлөгдөх төслийн барааны код (заавар: VAT_FREE → "304").
      ...(taxType === 'VAT_FREE' ? { taxProductCode: '304' } : {}),
      measureUnit: 'ш',
      qty: 1.0,
      unitPrice: total,
      totalAmount: total,
      totalVAT: vat,
      totalCityTax: 0,
    };

    const payload: any = {
      branchNo: merchant.branchNo,
      totalAmount: total,
      totalVAT: vat,
      totalCityTax: 0,
      districtCode: merchant.districtCode,
      merchantTin: merchant.merchantTin,
      posNo: merchant.posNo,
      customerTin: isB2B ? args.customerTin : null,
      type: isB2B ? 'B2B_RECEIPT' : 'B2C_RECEIPT',
      inactiveId: null,
      reportMonth: null,
      // Заавал талбар: багц дотор баримтыг дугаарлана. Бид багц бүрд ганц
      // баримт үүсгэдэг тул үргэлж "01".
      billIdSuffix: '01',
      receipts: [
        {
          taxType,
          merchantTin: merchant.merchantTin,
          customerTin: isB2B ? args.customerTin : null,
          totalAmount: total,
          totalVAT: vat,
          totalCityTax: 0,
          items: [item],
        },
      ],
      // Мөнгө нь баримт хэвлэхээс өмнө PSP-ээр аль хэдийн төлөгдсөн.
      payments: [{ code: paymentCode(args.paymentProvider), status: 'PAID', paidAmount: total, data: null }],
    };

    const res = await fetch(`${this.baseUrl}/rest/receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON */
    }
    // Заавар: status ∈ {SUCCESS, ERROR, PAYMENT}. PAYMENT нь "төлбөрийн мэдээлэл
    // дутуу" гэсэн үг тул бид үүнийг амжилт гэж үзэхгүй.
    const status = String(body?.status ?? '').toUpperCase();
    if (!res.ok || (status && status !== 'SUCCESS')) {
      const hint = status === 'PAYMENT' ? ' (төлбөрийн мэдээлэл дутуу)' : '';
      throw new Error(
        `POS API receipt failed (${res.status} ${status})${hint}: ${String(body?.message ?? body?.msg ?? text).slice(0, 300)}`,
      );
    }
    if (!body?.id) {
      throw new Error(`POS API receipt returned no id (ДДТД): ${text.slice(0, 300)}`);
    }

    // Best-effort push to ТЕГ — the local service also syncs on its own.
    fetch(`${this.baseUrl}/rest/sendData`, { signal: AbortSignal.timeout(30_000) }).catch(() => undefined);

    return {
      receiptNo: String(body.id),
      lottery: body.lottery ? String(body.lottery) : null,
      qrData: body.qrData ? String(body.qrData) : null,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Төлбөрийн хэлбэрийн код (заавар: CASH | PAYMENT_CARD | BANK_TRANSFER |
 * BANK_TRANSFER_QPAY). Bonum бол картын гарц, QPay нь өөрийн кодтой.
 */
function paymentCode(provider: string): string {
  return provider.startsWith('qpay') ? 'BANK_TRANSFER_QPAY' : 'PAYMENT_CARD';
}

/** /rest/info дээр бүртгэгдсэн нэг POS. */
export interface PosRegistration {
  merchantTin: string | null;
  merchantName: string | null;
  branchNo: string | null;
  posNo: string;
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * /rest/info-г мөчирлөн уншиж POS бүрийг олно. Хариуны яг бүтэц (merchants →
 * branches → poses уу, эсвэл хавтгай жагсаалт уу) instance-ийн хувилбараас
 * хамаардаг тул мод даган ойрын `tin` / `branchNo`-г өвлүүлэн авна.
 */
function collectPosRegistrations(body: any): PosRegistration[] {
  const out: PosRegistration[] = [];
  const seen = new Set<string>();
  const walk = (node: any, tin: string | null, branchNo: string | null, name: string | null) => {
    if (!node || typeof node !== 'object') return;
    const tinHere = str(node.merchantTin) ?? str(node.tin) ?? tin;
    const branchHere = str(node.branchNo) ?? str(node.branchId) ?? branchNo;
    const nameHere = str(node.merchantName) ?? str(node.name) ?? name;
    const posNo = str(node.posNo) ?? str(node.posNumber);
    if (posNo && !seen.has(posNo)) {
      seen.add(posNo);
      out.push({ merchantTin: tinHere, merchantName: nameHere, branchNo: branchHere, posNo });
    }
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach((c) => walk(c, tinHere, branchHere, nameHere));
      else if (v && typeof v === 'object') walk(v, tinHere, branchHere, nameHere);
    }
  };
  walk(body, null, null, null);
  return out;
}

/** /rest/info хариунаас бүх `tin` / `merchantTin` талбарыг цуглуулна. */
function collectTins(body: any): Set<string> {
  const tins = new Set<string>();
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.tin === 'string') tins.add(node.tin);
    if (typeof node.merchantTin === 'string') tins.add(node.merchantTin);
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(body);
  return tins;
}
