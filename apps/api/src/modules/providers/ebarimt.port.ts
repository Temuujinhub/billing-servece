/**
 * eBarimt provider port. Receipt creation goes through exactly one adapter,
 * selected by env (EBARIMT_PROVIDER=mock|qpay|posapi):
 *   • mock   — realistic local receipts (demo)
 *   • qpay   — QPay's bundled /v2/ebarimt/create (only for qpay payments)
 *   • posapi — ТЕГ POS API 3.0 local service (LIME instance, VAT_BASE_URL)
 */
export interface EbarimtCreateArgs {
  tenantId: string;
  /** Gross amount in integer MNT (VAT included). */
  amount: number;
  /** Item/receipt description shown on the receipt. */
  description: string;
  receiptType: 'CITIZEN' | 'ORGANIZATION';
  /** Payer TIN/regNo for ORGANIZATION (B2B) receipts. */
  customerTin?: string | null;
  /** Which PSP settled the money (qpay | bonum | qpay_mock …). */
  paymentProvider: string;
  providerPaymentId: string;
  /** Per-tenant POS registration — REQUIRED for posapi; each tenant company
   *  must be registered at ТЕГ with its OWN merchantTin + posNo (LIME-ийн
   *  posNo-г өөр компанийн баримтад ашиглаж болохгүй). */
  merchant?: {
    merchantTin?: string | null;
    posNo?: string | null;
    branchNo?: string | null;
    districtCode?: string | null;
    /**
     * ТЕГ-ийн бүртгэлээс (getInfo?tin=) ирсэн татварын төлөв. Эдгээрээс
     * баримтын `taxType` шалтгаална — НӨАТ суутган төлөгч БИШ байгууллагад
     * 10% НӨАТ бодох нь буруу баримт үүсгэнэ.
     */
    vatPayer?: boolean | null;
    /** НӨАТ-аас чөлөөлөгдөх төсөл (taxType=VAT_FREE, taxProductCode=304). */
    vatFreeProject?: boolean | null;
  };
}

export interface EbarimtCreateResult {
  /**
   * БОРЛУУЛАГЧИЙН ДДТД — ebarimt.mn дээр tenant-ийн нэр дээр бүртгэгдэх дугаар.
   * POS API 3.0-д энэ нь `receipts[].id` (merchantTin = tenant-ийн ТТД), top-level
   * `id` БИШ: операторын POS-оор дамжуулсан үед top-level дугаар операторын ТТД
   * угтвартай байдаг тул tenant-ийн порталтай хэзээ ч таардаггүй (B-70).
   */
  receiptNo: string;
  /** Багц (top-level) баримтын ДДТД — POS API-ийн `id`; цуцлахад үүнийг илгээнэ. */
  batchReceiptNo?: string | null;
  lottery: string | null;
  qrData: string | null;
  /** POS API-ийн буцаасан баримтын огноо ("yyyy-MM-dd HH:mm:ss") — цуцлахад заавал хэрэгтэй. */
  receiptDate?: string | null;
  /** Provider-ийн түүхий хариу — lottery/qrData ХАССАН (ТЕГ: хадгалахыг хориглоно). */
  raw?: Record<string, unknown> | null;
}

export interface EbarimtCancelArgs {
  tenantId: string;
  /** Багц баримтын ДДТД (batchReceiptNo; хуучин мөрөнд receiptNo) — DELETE /rest/receipt-ийн `id`. */
  receiptNo: string;
  /** Баримт үүссэн огноо "yyyy-MM-dd HH:mm:ss" — POS API DELETE-д шаардлагатай. */
  receiptDate: string;
}

export interface EbarimtPort {
  readonly code: string;
  createReceipt(args: EbarimtCreateArgs): Promise<EbarimtCreateResult>;
  /** Баримт цуцлах (буцаалт) — дэмждэггүй adapter undefined орхино. */
  cancelReceipt?(args: EbarimtCancelArgs): Promise<void>;
}

export const EBARIMT_PORT = 'EBARIMT_PORT';
