import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EbarimtCreateArgs, EbarimtCreateResult, EbarimtPort } from './ebarimt.port';

/**
 * ТЕГ eBarimt POS API 3.0 adapter — LIME-ээр дамжуулан суулгасан instance
 * (production: https://vat.onlime.mn, LIME merchantTin 37900846788).
 *
 * VAT_BASE_URL нь ТЕГ-ийн нийтийн API БИШ: энэ нь LIME-ийн hosted / өөрийн
 * сервер дээр ажиллаж буй POS API 3.0 үйлчилгээ. Урьдчилсан нөхцөл:
 *   1. Тухайн tenant компани ТЕГ-т ӨӨРИЙН merchantTin-тэй бүртгэлтэй байх
 *      (multi-merchant instance дээр LIME-ийн merchant жагсаалтад орсон байх).
 *   2. GET {VAT_BASE_URL}/rest/info — бүртгэл (merchants, posNo) зөв эсэхийг
 *      адаптер ажиллуулахын өмнө шалгана (энд lazy шалгаж, posNo-г мөн
 *      эндээс автоматаар авдаг тул EBARIMT_POS_NO заавал биш).
 *
 * Receipt lifecycle: POST /rest/receipt (create) → GET /rest/sendData
 * (best-effort push to ТЕГ; the service also syncs on its own schedule).
 */
@Injectable()
export class PosApiEbarimtAdapter implements EbarimtPort {
  readonly code = 'ebarimt_posapi';
  private readonly logger = new Logger(PosApiEbarimtAdapter.name);
  /** Instance registration snapshot from /rest/info (TINs + assigned posNo). */
  private instanceInfo: { tins: Set<string>; posNo: string | null } | null = null;
  private infoFlight: Promise<{ tins: Set<string>; posNo: string | null } | null> | null = null;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    const v = this.config.get<string>('VAT_BASE_URL');
    if (!v) throw new Error('eBarimt POS API is not configured (VAT_BASE_URL)');
    return v.replace(/\/+$/, '');
  }

  // ------------------------------------------------------------------ info

  /** GET /rest/info — merchants/posNo registered on this instance. */
  async info(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/rest/info`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`POS API /rest/info failed (${res.status})`);
    return res.json();
  }

  /** Lazily snapshot the instance registration; null = info unavailable (don't block). */
  private async getInstanceInfo(): Promise<{ tins: Set<string>; posNo: string | null } | null> {
    if (this.instanceInfo) return this.instanceInfo;
    if (!this.infoFlight) {
      this.infoFlight = this.info()
        .then((body) => {
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
          const snapshot = {
            tins,
            posNo: body?.posNo != null ? String(body.posNo) : null,
          };
          this.instanceInfo = snapshot;
          this.logger.log(`POS API instance ready — posNo=${snapshot.posNo ?? '?'}, ${tins.size} registered TIN(s)`);
          return snapshot;
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
    const info = await this.getInstanceInfo();

    const merchantTin = args.merchant?.merchantTin || this.config.get<string>('EBARIMT_MERCHANT_TIN');
    if (!merchantTin) {
      throw new Error('eBarimt POS registration missing: set tenant ebarimtMerchantTin or EBARIMT_MERCHANT_TIN');
    }
    // posNo: tenant → env → the instance's own posNo from /rest/info.
    const posNo = args.merchant?.posNo || this.config.get<string>('EBARIMT_POS_NO') || info?.posNo;
    if (!posNo) {
      throw new Error(
        `eBarimt posNo unknown: set tenant ebarimtPosNo / EBARIMT_POS_NO, or make ${this.baseUrl}/rest/info reachable (it reports the assigned posNo)`,
      );
    }
    const branchNo = args.merchant?.branchNo || this.config.get<string>('EBARIMT_BRANCH_NO') || '001';
    const districtCode = args.merchant?.districtCode || this.config.get<string>('EBARIMT_DISTRICT_CODE') || '2315';

    // Registration guard (заавар §3): a receipt for an unregistered TIN fails
    // anyway — fail early with an actionable message instead.
    if (info && info.tins.size > 0 && !info.tins.has(merchantTin)) {
      throw new Error(
        `merchantTin ${merchantTin} is not registered on the POS API instance (${this.baseUrl}/rest/info) — register the company first`,
      );
    }

    // Integer-MNT gross → VAT-inclusive decomposition (standard 10% НӨАТ).
    const total = round2(args.amount);
    const vat = round2(total - total / 1.1);
    const isB2B = args.receiptType === 'ORGANIZATION' && !!args.customerTin;
    const customerTin = isB2B ? args.customerTin : null;

    const item = {
      name: args.description.slice(0, 128) || 'Үйлчилгээ',
      barCode: null,
      barCodeType: 'UNDEFINED',
      classificationCode: this.config.get<string>('EBARIMT_CLASSIFICATION_CODE') || '6499999',
      taxProductCode: null,
      measureUnit: 'ш',
      qty: 1,
      unitPrice: total,
      totalAmount: total,
      totalVAT: vat,
      totalCityTax: 0,
    };

    const payload: any = {
      totalAmount: total,
      // Both spellings on purpose: the spec uses totalVAT, while the LIME
      // vat.onlime.mn instance is driven with totalVat — extras are ignored.
      totalVAT: vat,
      totalVat: vat,
      totalCityTax: 0,
      branchNo,
      districtCode,
      merchantTin,
      posNo,
      customerTin,
      consumerNo: null,
      type: isB2B ? 'B2B_RECEIPT' : 'B2C_RECEIPT',
      billIdSuffix: this.config.get<string>('EBARIMT_BILL_ID_SUFFIX') || '01',
      receipts: [
        {
          taxType: 'VAT_ABLE',
          merchantTin,
          customerTin,
          totalAmount: total,
          totalVAT: vat,
          totalCityTax: 0,
          items: [item],
        },
      ],
      // Money already settled by the PSP before the receipt is cut. QPay
      // settlements go out as BANK_TRANSFER_QPAY (proven against the LIME
      // instance); everything else as the spec enum PAYMENT_CARD.
      payments: [
        {
          code:
            this.config.get<string>('EBARIMT_PAYMENT_CODE') ||
            (args.paymentProvider?.includes('qpay') ? 'BANK_TRANSFER_QPAY' : 'PAYMENT_CARD'),
          status: 'PAID',
          paidAmount: total,
        },
      ],
    };

    const res = await fetch(`${this.baseUrl}/rest/receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
    if (!res.ok || (body?.status && !['SUCCESS', 'PAYED', 'REGISTERED'].includes(String(body.status).toUpperCase()))) {
      throw new Error(`POS API receipt failed (${res.status} ${body?.status ?? ''}): ${String(body?.message ?? text).slice(0, 300)}`);
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
