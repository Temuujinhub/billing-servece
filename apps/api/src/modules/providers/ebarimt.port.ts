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
  receiptNo: string;
  lottery: string | null;
  qrData: string | null;
}

export interface EbarimtPort {
  readonly code: string;
  createReceipt(args: EbarimtCreateArgs): Promise<EbarimtCreateResult>;
}

export const EBARIMT_PORT = 'EBARIMT_PORT';
