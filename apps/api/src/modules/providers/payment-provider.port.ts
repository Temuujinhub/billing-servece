/**
 * Payment provider port (PRD §6.4). Every PSP (QPay, SocialPay, bank e-billing)
 * implements this interface; provider payloads never leak past the adapter.
 * `tenantId` lets adapters resolve tenant-level credentials (UI-configurable).
 */
export interface CreateProviderInvoiceResult {
  providerInvoiceId: string;
  qrText: string;
  deeplinks: { name: string; logo?: string; link: string }[];
  expiresAt: Date;
}

export interface ProviderPaymentStatus {
  paid: boolean;
  providerPaymentId?: string;
  gross?: number;
  fee?: number;
  paidAt?: Date;
}

export interface PaymentProviderPort {
  readonly code: string;
  createInvoice(args: {
    tenantId: string;
    amount: number;
    description: string;
    internalRef: string;
  }): Promise<CreateProviderInvoiceResult>;
  /** Authoritative check — callbacks alone are never trusted (PAY-03). */
  getPaymentStatus(providerInvoiceId: string, tenantId: string): Promise<ProviderPaymentStatus>;
  cancelInvoice(providerInvoiceId: string, tenantId: string): Promise<void>;
  /** Return the money for a confirmed payment (PAY-06). */
  refundPayment(providerPaymentId: string, tenantId: string, note?: string): Promise<void>;
}
