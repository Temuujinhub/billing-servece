// Shared API types (mirrors apps/api responses).

export type Role = 'OWNER' | 'OPERATOR' | 'ACCOUNTANT' | 'VIEWER';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string;
  isAdmin?: boolean;
  /** Партнёрын ажилтан: BONUM | EBARIMT (энгийн хэрэглэгчид null). */
  partnerKind?: 'BONUM' | 'EBARIMT' | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: SessionUser;
}

export type InvoiceState =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED'
  | 'EXPIRED';

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  externalRef: string | null;
  createdAt: string;
  _count?: { invoices: number };
}

export interface Invoice {
  id: string;
  number: string;
  description: string;
  amount: number;
  balance: number;
  state: InvoiceState;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone?: string | null };
  payUrl?: string | null;
}

export interface InvoiceDetail extends Invoice {
  customer: Customer;
  viewedAt: string | null;
  cancelledAt: string | null;
  batch?: { id: string; fileName: string | null; status: string } | null;
  shortLinks: { id: string; clicks: number; createdAt: string; expiresAt: string | null; revokedAt: string | null }[];
  messageJobs: { id: string; recipient: string; body: string; segments: number; status: string; error: string | null; createdAt: string }[];
  intents: {
    id: string;
    state: string;
    amount: number;
    provider: string;
    createdAt: string;
    transactions: {
      id: string;
      providerPaymentId: string;
      gross: number;
      paidAt: string;
      receipts: { id: string; state: string; receiptNo: string | null; lottery: string | null; qrData: string | null }[];
    }[];
    events: { id: string; type: string; createdAt: string }[];
  }[];
}

export interface BatchPreview {
  batch: {
    id: string;
    status: string;
    fileName: string | null;
    rowCount: number;
    validCount: number;
    errorCount: number;
    totalAmount: number;
    createdAt: string;
  };
  rows: {
    rowNo: number;
    raw: Record<string, string>;
    normalized: {
      phone: string;
      amount: number;
      description: string;
      customerName: string;
      dueDate: string | null;
    } | null;
    errors: string[] | null;
    warnings: string[] | null;
    valid: boolean;
  }[];
  estimate: { smsSegments: number; invoiceMsgs: number; msgUnitPrice: number; smsCost: number };
}

export interface InspectResult {
  fileName: string;
  rowCount: number;
  columns: { index: number; header: string; samples: string[] }[];
  suggested: Record<string, number>;
  systemFields: { key: string; label: string; required: boolean }[];
}

export interface DashboardData {
  kpis: {
    collectedThisMonth: number;
    paymentsThisMonth: number;
    collected30d: number;
    outstandingBalance: number;
    outstandingCount: number;
    paymentRate: number;
    receiptPending: number;
    smsSegmentsThisMonth: number;
  };
  stateSplit: { state: InvoiceState; count: number; amount: number }[];
  series: { date: string; amount: number }[];
  recentInvoices: {
    id: string;
    number: string;
    customerName: string;
    amount: number;
    balance: number;
    state: InvoiceState;
    dueDate: string | null;
    createdAt: string;
  }[];
  totalInvoices: number;
}

export interface PaymentRow {
  id: string;
  providerPaymentId: string;
  gross: number;
  fee: number;
  net: number;
  status: string;
  paidAt: string;
  intent: {
    provider: string;
    invoice: { id: string; number: string; customer: { name: string } };
  };
  receipts: { state: string; receiptNo: string | null }[];
}

export interface ReceiptRow {
  id: string;
  receiptNo: string | null;
  lottery: string | null;
  qrData: string | null;
  state: string;
  error: string | null;
  retries: number;
  createdAt: string;
  /** Баримтын гарал: payment (нэхэмжлэхийн төлбөр) | api (Үйлчилгээ 3) | pos (Үйлчилгээ 4). */
  source: 'payment' | 'api' | 'pos';
  /** Standalone (api/pos) баримтын дүн/тайлбар — payment баримт нь гүйлгээнээсээ авна. */
  amount: number | null;
  description: string | null;
  deviceId: string | null;
  /** Standalone баримтад NULL. */
  transaction: {
    gross: number;
    paidAt: string;
    intent: { invoice: { id: string; number: string; customer: { name: string } } };
  } | null;
}

/** Тарифын загвар v2 — суурь хураамжгүй, 4 үйлчилгээ, НӨАТ нэмж тооцно. */
export interface EbarimtTier {
  upTo: number | null;
  fee: number;
}

export interface PublicPricing {
  INVOICE_MSG: number;
  API_INVOICE_MSG: number;
  EBARIMT_API_ONBOARDING: number;
  EBARIMT_API_TIERS: EbarimtTier[];
  POS_PER_DEVICE: number;
  VAT_PERCENT: number;
}

export interface TenantModuleInfo {
  code: string;
  enabled: boolean;
  quantity: number;
  /** Tenant-тэй тохиролцсон нэгж үнэ — null бол глобал тариф. */
  unitPrice?: number | null;
  /** EBARIMT_API шатлал (1..3). */
  tier?: number | null;
}

export interface PosTerminal {
  id: string;
  deviceId: string;
  name: string | null;
  status: 'ACTIVE' | 'BLOCKED';
  receiptCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ServiceBill {
  id: string;
  tenantId?: string;
  cycle: string;
  lines: { code: string; label: string; qty: number; unitPrice: number; amount: number }[];
  subtotal: number;
  vat: number;
  total: number;
  status: string;
  invoiceId: string | null;
  createdAt: string;
}

export interface BillingOverview {
  cycleStart: string;
  modules: TenantModuleInfo[];
  pricing: PublicPricing;
  usage: {
    invoiceMsgsExcel: number;
    invoiceMsgsApi: number;
    apiReceipts: number;
    apiReceiptLimit: number | null;
    activeTerminals: number;
    smsSegments: number;
    receiptsCreated: number;
    invoicesCreated: number;
    paymentsSucceeded: number;
  };
  terminals: PosTerminal[];
  bills: ServiceBill[];
  estimate: {
    lines: { code: string; label: string; qty: number; unitPrice: number; amount: number }[];
    subtotal: number;
    vat: number;
    total: number;
    note: string;
  };
}

export interface PayPageData {
  merchant: { name: string; phone: string | null; email: string | null };
  invoice: {
    number: string;
    description: string;
    amount: number;
    balance: number;
    state: InvoiceState;
    dueDate: string | null;
    customerName: string;
  };
  payment: { intentId: string; state: string; qrText: string | null; paymentUrl: string | null; expiresAt: string | null } | null;
  receipt: { receiptNo: string | null; lottery: string | null; qrData: string | null; state: string } | null;
  sandbox: boolean;
}

export type IntegrationKind = 'BONUM' | 'EBARIMT';
export type IntegrationRequestStatus = 'SUBMITTED' | 'EMAIL_SENT' | 'APPROVED' | 'REJECTED';

export interface IntegrationRequest {
  id: string;
  tenantId: string;
  kind: IntegrationKind;
  status: IntegrationRequestStatus;
  payload: Record<string, string | null>;
  note: string | null;
  error: string | null;
  emailedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/**
 * `/admin/integration-requests` (болон `/partner/requests`) нь байгууллагын
 * одоогийн утгуудыг хамт буцаана — хариуны маягтыг тэдгээрээр урьдчилан
 * бөглөж, аль хэдийн мэдэгдэж буй зүйлийг дахин бичүүлэхгүй. Шифрлэгдсэн
 * нууц утга хэзээ ч ирэхгүй, зөвхөн байгаа эсэх нь тугаар ирнэ.
 */
export interface AdminIntegrationRequest extends IntegrationRequest {
  tenant: {
    id: string;
    name: string;
    regNo: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    tin: string | null;
    ebarimtMerchantTin: string | null;
    ebarimtPosNo: string | null;
    ebarimtBranchNo: string | null;
    ebarimtDistrictCode: string | null;
    bonumTerminalId: string | null;
    hasBonumAppSecret: boolean;
    hasBonumChecksumKey: boolean;
  };
}

export interface TenantInfo {
  tenant: {
    id: string;
    name: string;
    regNo: string | null;
    tin: string | null;
    kybStatus: string;
    invoicePrefix: string;
    contactEmail: string | null;
    contactPhone: string | null;
    smsTemplate: string | null;
    smsTransliterate: boolean;
    address: string | null;
    bankName: string | null;
    bankAccount: string | null;
    bankAccountName: string | null;
    representative: string | null;
    ebarimtMerchantTin: string | null;
    ebarimtPosNo: string | null;
    ebarimtBranchNo: string | null;
    ebarimtDistrictCode: string | null;
    bonumTerminalId: string | null;
    hasBonumAppSecret: boolean;
    hasBonumChecksumKey: boolean;
    createdAt: string;
    modules: { code: string; enabled: boolean; quantity: number }[];
  };
  team: { id: string; role: Role; user: { id: string; name: string; email: string }; since: string }[];
  me: { userId: string; email: string; name: string; role: Role };
}

export interface TeamMember {
  id: string;
  role: Role;
  user: { id: string; name: string; email: string };
}

export interface ReportsSummary {
  days: number;
  since: string;
  invoices: { count: number; amount: number; outstanding: number };
  payments: { count: number; gross: number; fee: number };
  smsSegments: number;
  byState: { state: InvoiceState; count: number; amount: number }[];
  topCustomers: { customerId: string; name: string; invoices: number; amount: number }[];
}

export type ApiKeyScope = 'invoice' | 'receipt' | 'pos';

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  scopes: ApiKeyScope[];
  mode: 'live' | 'test';
  createdAt: string;
  revokedAt: string | null;
}

export interface WebhookInfo {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastStatus: number | null;
  lastAt: string | null;
  createdAt: string;
}

export interface DevelopersOverview {
  keys: ApiKeyInfo[];
  webhooks: WebhookInfo[];
}
