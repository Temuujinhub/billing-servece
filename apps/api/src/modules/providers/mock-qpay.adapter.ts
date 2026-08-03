import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { CreateProviderInvoiceResult, PaymentProviderPort, ProviderPaymentStatus } from './payment-provider.port';

/**
 * MOCK QPay adapter — производствод бодит мөнгө хөдөлгөдөггүй.
 *
 * Deliberately mirrors the real QPay Merchant V2 flow (create invoice → QR +
 * deeplinks → callback → payment/check) so swapping in the real adapter is a
 * drop-in change once the merchant contract and production credentials exist.
 * Paid state lives in-memory only; the DB ledger is written exclusively by
 * PaymentsService after a successful `getPaymentStatus` check, exactly like
 * it will be with the real provider.
 */
@Injectable()
export class MockQpayAdapter implements PaymentProviderPort {
  readonly code = 'qpay_mock';
  private readonly logger = new Logger(MockQpayAdapter.name);
  /** providerInvoiceId → paid marker (survives only for process lifetime). */
  private readonly paidInvoices = new Map<string, { providerPaymentId: string; gross: number; paidAt: Date }>();
  private readonly amounts = new Map<string, number>();

  async createInvoice(args: { amount: number; description: string; internalRef: string }): Promise<CreateProviderInvoiceResult> {
    const providerInvoiceId = `MQP-${randomUUID()}`;
    this.amounts.set(providerInvoiceId, args.amount);
    const qrText = `0002010102121531279404962794049640014${randomBytes(12).toString('hex').toUpperCase()}5204482953034965405${args.amount}5802MN5913BILLINGSMOCK6304TEST`;
    return {
      providerInvoiceId,
      qrText,
      deeplinks: [
        { name: 'QPay wallet', link: `qpaywallet://q?qPay_QRcode=${encodeURIComponent(qrText)}` },
        { name: 'Khan bank', link: `khanbank://q?qPay_QRcode=${encodeURIComponent(qrText)}` },
        { name: 'Social Pay', link: `socialpay-payment://q?qPay_QRcode=${encodeURIComponent(qrText)}` },
        { name: 'TDB', link: `tdbbank://q?qPay_QRcode=${encodeURIComponent(qrText)}` },
      ],
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  }

  async getPaymentStatus(providerInvoiceId: string): Promise<ProviderPaymentStatus> {
    const paid = this.paidInvoices.get(providerInvoiceId);
    if (!paid) return { paid: false };
    return {
      paid: true,
      providerPaymentId: paid.providerPaymentId,
      gross: paid.gross,
      fee: 0, // real QPay deducts a merchant fee per contract — reconcile then
      paidAt: paid.paidAt,
    };
  }

  async cancelInvoice(providerInvoiceId: string): Promise<void> {
    this.amounts.delete(providerInvoiceId);
    this.paidInvoices.delete(providerInvoiceId);
  }

  /** Sandbox hook: mark an invoice as paid, as if a payer scanned the QR. */
  simulatePayment(providerInvoiceId: string): { providerPaymentId: string } | null {
    const amount = this.amounts.get(providerInvoiceId);
    if (amount === undefined) return null;
    const existing = this.paidInvoices.get(providerInvoiceId);
    if (existing) return { providerPaymentId: existing.providerPaymentId };
    const marker = { providerPaymentId: `MQPAY-${randomUUID()}`, gross: amount, paidAt: new Date() };
    this.paidInvoices.set(providerInvoiceId, marker);
    this.logger.log(`[mock-qpay] simulated payment for ${providerInvoiceId}`);
    return { providerPaymentId: marker.providerPaymentId };
  }
}
