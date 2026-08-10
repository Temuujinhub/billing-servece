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
  /** Операторын POS дугаар (/rest/info) — posNo тохируулаагүй үеийн fallback. */
  private instancePosNo: string | null = null;
  /** Top-түвшний merchants[] (баримт багцын эзэн байж чадах TIN-үүд). */
  private merchantTins: Set<string> | null = null;
  /** Борлуулагч TIN → түүнийг агуулж буй top-түвшний merchant-ийн TIN. */
  private sellerParent: Map<string, string> | null = null;
  private infoFlight: Promise<Set<string> | null> | null = null;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    const v = this.config.get<string>('VAT_BASE_URL');
    if (!v) throw new Error('eBarimt POS API is not configured (VAT_BASE_URL)');
    return v.replace(/\/+$/, '');
  }

  /** Env defaults; tenants override per receipt (multi-merchant instance). */
  private async merchantConfig(override?: EbarimtCreateArgs['merchant']) {
    const merchantTin = override?.merchantTin || this.config.get<string>('EBARIMT_MERCHANT_TIN');
    if (!merchantTin) {
      throw new Error('eBarimt POS registration missing: set tenant ebarimtMerchantTin or EBARIMT_MERCHANT_TIN');
    }
    // posNo: tenant → env → операторын POS-ийн дугаарыг /rest/info-оос автоматаар.
    // Заавраар нэг instance = нэг операторын posNo тул үүнийг гараар бичүүлэх
    // шаардлагагүй — бүртгэлгүй үед л алдаа өгнө.
    let posNo = override?.posNo || this.config.get<string>('EBARIMT_POS_NO');
    if (!posNo) {
      posNo = (await this.getRegisteredTins().then(() => this.instancePosNo)) ?? undefined;
    }
    if (!posNo) {
      throw new Error(
        `eBarimt posNo unknown: set tenant ebarimtPosNo / EBARIMT_POS_NO, or make ${this.baseUrl}/rest/info reachable (it reports the operator posNo)`,
      );
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
   * /rest/info-г бүтэцлэн уншина. Заавраар нэг instance = НЭГ `posNo`
   * (операторын POS), доор нь тэрхүү POS дээр бүртгэгдсэн мерчантуудын
   * жагсаалт:
   *
   *   { operatorName, operatorTIN, posId, posNo,
   *     merchants: [ { name, tin, customers: [...] } ] }
   *
   * Өөрөөр хэлбэл posNo нь мерчант бүрд ӨӨР БИШ — операторын нэг POS дээр
   * олон мерчант бүртгэгдэж, баримт нь `merchantTin`-ээр ялгагдана.
   */
  async instanceInfo(): Promise<PosApiInstanceInfo> {
    const body = await this.info();
    const merchants: { name: string | null; tin: string }[] = [];
    // Борлуулагч = merchants[] өөрсдөө + тэдгээрийн customers[]. LIME-ийн
    // vat.onlime.mn дээр гэрээт компаниуд (Медиапрофессионал г.м) операторын
    // ГАНЦ merchant-ийн customers дотор бүртгэгддэг — тэд өөрсдөө top-түвшний
    // merchant БИШ ч энэ POS-оор баримт олгох эрхтэй.
    const sellers = new Map<string, { name: string | null; viaMerchantTin: string }>();
    for (const m of Array.isArray(body?.merchants) ? body.merchants : []) {
      const tin = str(m?.tin) ?? str(m?.merchantTin);
      if (!tin) continue;
      merchants.push({ name: str(m?.name), tin });
      if (!sellers.has(tin)) sellers.set(tin, { name: str(m?.name), viaMerchantTin: tin });
      for (const c of Array.isArray(m?.customers) ? m.customers : []) {
        const ctin = str(c?.tin);
        if (ctin && !sellers.has(ctin)) sellers.set(ctin, { name: str(c?.name), viaMerchantTin: tin });
      }
    }
    // Кэшийг зэрэг шинэчилнэ (баримт үүсгэхийн өмнөх хамгаалалт үүнийг уншдаг).
    this.registeredTins = new Set(sellers.keys());
    this.sellerParent = new Map(Array.from(sellers, ([tin, v]) => [tin, v.viaMerchantTin]));
    this.merchantTins = new Set(merchants.map((m) => m.tin));
    this.instancePosNo = str(body?.posNo);
    return {
      operatorName: str(body?.operatorName),
      operatorTin: str(body?.operatorTIN) ?? str(body?.operatorTin),
      posNo: this.instancePosNo,
      merchants,
      sellers: Array.from(sellers, ([tin, v]) => ({ tin, name: v.name, viaMerchantTin: v.viaMerchantTin })),
    };
  }

  /**
   * Админы «Холболт шалгах»: /rest/info-г ШИНЭЭР татаад тухайн компанийн
   * merchantTin энэ POS дээр (merchant эсвэл операторын customer-ээр)
   * бүртгэгдсэн эсэхийг хэлнэ.
   */
  async checkRegistration(merchantTin?: string | null): Promise<{ tins: string[]; registered: boolean | null }> {
    const info = await this.instanceInfo();
    const tins = info.sellers.map((s) => s.tin);
    if (!merchantTin) return { tins, registered: null };
    // Хоосон жагсаалт нь "мэдэхгүй" — instance нь мерчантуудаа ил гаргаагүй байж болно.
    return { tins, registered: tins.length === 0 ? null : tins.includes(merchantTin) };
  }

  /**
   * Онбордингийн сүүлийн алхам: мерчант ebarimt.mn дээрээ операторын хүсэлтийг
   * баталгаажуулмагц түүний ТТД энэ instance-ийн бүртгэлд (merchants эсвэл
   * операторын customers) гарч ирдэг. Тэр үед л уг компани операторын `posNo`
   * дээр баримт хэвлэх эрхтэй болно — posNo-г хэрэглэгчээр бичүүлэхгүй,
   * эндээс шууд олгоно.
   */
  async discoverRegistration(merchantTin?: string | null): Promise<{
    posNo: string | null;
    /** merchantTin энэ POS дээр бүртгэгдсэн эсэх. */
    matched: boolean;
    merchants: { name: string | null; tin: string }[];
  }> {
    const info = await this.instanceInfo();
    const matched = Boolean(merchantTin && info.sellers.some((s) => s.tin === merchantTin));
    // Жагсаалтад борлуулагчдыг (операторын customers орсон) буцаана — админ UI
    // "хэн бүртгэлтэй вэ"-г үүгээр харуулдаг.
    return { posNo: info.posNo, matched, merchants: info.sellers.map((s) => ({ name: s.name, tin: s.tin })) };
  }

  /** Lazily collect registered seller TINs; null = info unavailable (don't block). */
  private async getRegisteredTins(): Promise<Set<string> | null> {
    if (this.registeredTins) return this.registeredTins;
    if (!this.infoFlight) {
      this.infoFlight = this.instanceInfo()
        .then((info) => {
          this.logger.log(`POS API ready — POS ${info.posNo ?? '?'}, ${info.merchants.length} merchant(s), ${info.sellers.length} seller(s)`);
          return this.registeredTins;
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
    const merchant = await this.merchantConfig(args.merchant);

    // Registration guard (заавар §3): a receipt for an unregistered TIN fails
    // anyway — fail early with an actionable message instead.
    const tins = await this.getRegisteredTins();
    if (tins && tins.size > 0 && !tins.has(merchant.merchantTin)) {
      throw new Error(
        `merchantTin ${merchant.merchantTin} is not registered on the POS API instance (${this.baseUrl}/rest/info: merchants + customers аль алинд нь алга) — register the company first`,
      );
    }

    // Оператор-дамжуулсан загвар (LIME vat.onlime.mn): гэрээт компани нь
    // top-түвшний merchant БИШ, операторын merchant-ийн customer байдаг.
    // Тэр үед багцын (top) merchantTin = ОПЕРАТОРЫН TIN, дэд баримтын
    // merchantTin = БОРЛУУЛАГЧ компанийн TIN байж баримт амжилттай гардаг
    // (LIME-ийн ажиллаж буй жишээ кодтой ижил). Өөрөө top merchant бол
    // хоёр түвшинд өөрийн TIN явна.
    const sellerTin = merchant.merchantTin;
    let batchTin = sellerTin;
    if (this.merchantTins && !this.merchantTins.has(sellerTin)) {
      const parent = this.sellerParent?.get(sellerTin);
      if (parent) {
        batchTin = parent;
        this.logger.log(`eBarimt operator-mediated receipt: batch=${batchTin} (оператор), seller=${sellerTin}`);
      }
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
      // LIME-ийн vat.onlime.mn instance-ийн ажиллаж буй жишээ top-түвшинд
      // `totalVat` бичиглэл хэрэглэдэг — хоёуланг нь илгээж зөрүүг хаана
      // (илүүдэл талбарыг instance үл тоомсорлодог).
      totalVat: vat,
      totalCityTax: 0,
      districtCode: merchant.districtCode,
      // Багцын эзэн: өөрөө merchant бол өөрийн TIN, операторын customer бол
      // операторын TIN (дэд баримт нь борлуулагчийн TIN-ийг агуулна).
      merchantTin: batchTin,
      posNo: merchant.posNo,
      customerTin: isB2B ? args.customerTin : null,
      consumerNo: null,
      type: isB2B ? 'B2B_RECEIPT' : 'B2C_RECEIPT',
      inactiveId: null,
      reportMonth: null,
      // Заавал талбар: багц дотор баримтыг дугаарлана. Бид багц бүрд ганц
      // баримт үүсгэдэг тул үргэлж "01".
      billIdSuffix: '01',
      receipts: [
        {
          taxType,
          merchantTin: sellerTin,
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

/** /rest/info: нэг instance = операторын нэг POS + бүртгэлтэй мерчантууд. */
export interface PosApiInstanceInfo {
  operatorName: string | null;
  operatorTin: string | null;
  posNo: string | null;
  /** Top-түвшний merchants[] — баримт багцын эзэн байж чадах TIN-үүд. */
  merchants: { name: string | null; tin: string }[];
  /** Баримт олгох эрхтэй БҮХ TIN: merchants + тэдгээрийн customers. */
  sellers: { name: string | null; tin: string; viaMerchantTin: string }[];
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}
