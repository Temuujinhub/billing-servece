/**
 * Payment provider port (PRD §6.4). Every PSP (QPay, SocialPay, bank e-billing)
 * implements this interface; provider payloads never leak past the adapter.
 */
export interface CreateProviderInvoiceResult {
  providerInvoiceId: string;
  qrText: string;
  /** Hosted checkout page (web payment providers, e.g. Bonum). */
  paymentUrl?: string;
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
    amount: number;
    description: string;
    internalRef: string;
    /** Where hosted-checkout providers send the payer back (our pay page). */
    returnUrl?: string;
  }): Promise<CreateProviderInvoiceResult>;
  /** Authoritative check — callbacks alone are never trusted (PAY-03). */
  getPaymentStatus(providerInvoiceId: string): Promise<ProviderPaymentStatus>;
  cancelInvoice(providerInvoiceId: string): Promise<void>;
}
