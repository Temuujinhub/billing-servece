import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { apiError } from '../../common/filters/http-exception.filter';
import { sha256 } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { MockQpayAdapter } from './mock-qpay.adapter';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qpay: MockQpayAdapter,
    private readonly receipts: ReceiptsService,
    private readonly config: ConfigService,
  ) {}

  get sandbox(): boolean {
    return this.config.get('PAYMENT_SANDBOX') === 'true';
  }

  // ------------------------------------------------------------ public page

  /** Resolve a short-link token to the payer-facing invoice view. */
  async resolveToken(token: string) {
    const link = await this.prisma.shortLink.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        invoice: {
          include: {
            tenant: { select: { name: true, contactPhone: true, contactEmail: true } },
            customer: { select: { name: true } },
            intents: {
              where: { state: { in: ['PENDING', 'PROCESSING', 'SUCCEEDED'] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { transactions: { include: { receipts: true } } },
            },
          },
        },
      },
    });
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) {
      throw apiError(HttpStatus.NOT_FOUND, 'LINK_INVALID', 'Холбоос хүчингүй эсвэл хугацаа нь дууссан байна.', 'This payment link is invalid or expired.');
    }
    const invoice = link.invoice;

    // First open flips SENT → VIEWED (analytics only; never regresses paid states).
    await this.prisma.$transaction(async (tx) => {
      await tx.shortLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } });
      if (invoice.state === 'SENT') {
        await tx.invoice.updateMany({
          where: { id: invoice.id, state: 'SENT' },
          data: { state: 'VIEWED', viewedAt: new Date() },
        });
      }
    });

    const activeIntent = invoice.intents[0] ?? null;
    const receipt = activeIntent?.transactions[0]?.receipts[0] ?? null;
    return {
      merchant: {
        name: invoice.tenant.name,
        phone: invoice.tenant.contactPhone,
        email: invoice.tenant.contactEmail,
      },
      invoice: {
        number: invoice.number,
        description: invoice.description,
        amount: invoice.amount,
        balance: invoice.balance,
        state: invoice.state === 'SENT' ? 'VIEWED' : invoice.state,
        dueDate: invoice.dueDate,
        customerName: invoice.customer.name,
      },
      payment: activeIntent
        ? {
            intentId: activeIntent.id,
            state: activeIntent.state,
            qrText: activeIntent.qrText,
            expiresAt: activeIntent.expiresAt,
          }
        : null,
      receipt: receipt
        ? { receiptNo: receipt.receiptNo, lottery: receipt.lottery, qrData: receipt.qrData, state: receipt.state }
        : null,
      sandbox: this.sandbox,
    };
  }

  /** Payer pressed «Төлөх» — create (or reuse) a provider invoice/QR. */
  async createIntentForToken(token: string) {
    const link = await this.prisma.shortLink.findUnique({
      where: { tokenHash: sha256(token) },
      include: { invoice: true },
    });
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) {
      throw apiError(HttpStatus.NOT_FOUND, 'LINK_INVALID', 'Холбоос хүчингүй байна.', 'Invalid payment link.');
    }
    const invoice = link.invoice;
    if (['PAID', 'CANCELLED', 'EXPIRED'].includes(invoice.state)) {
      throw apiError(HttpStatus.CONFLICT, 'NOT_PAYABLE', 'Энэ нэхэмжлэх төлөгдөх боломжгүй төлөвт байна.', 'Invoice is not payable.');
    }

    // Reuse a live PENDING intent — refresh keeps one QR per invoice.
    const existing = await this.prisma.paymentIntent.findFirst({
      where: {
        invoiceId: invoice.id,
        state: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return this.intentView(existing.id);
    }

    const provider = await this.qpay.createInvoice({
      amount: invoice.balance,
      description: `${invoice.number} ${invoice.description}`.slice(0, 100),
      internalRef: invoice.id,
    });

    const intent = await this.prisma.paymentIntent.create({
      data: {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        amount: invoice.balance,
        provider: this.qpay.code,
        providerInvoiceId: provider.providerInvoiceId,
        state: 'PENDING',
        idemKey: randomUUID(),
        qrText: provider.qrText,
        expiresAt: provider.expiresAt,
        events: { create: { type: 'intent.created', payload: { providerInvoiceId: provider.providerInvoiceId } } },
      },
    });
    return { ...(await this.intentView(intent.id)), deeplinks: provider.deeplinks };
  }

  private async intentView(intentId: string) {
    const intent = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    return {
      intentId: intent.id,
      state: intent.state,
      amount: intent.amount,
      qrText: intent.qrText,
      expiresAt: intent.expiresAt,
    };
  }

  /**
   * Sandbox-only: simulate the payer completing the payment in their bank app.
   * Goes through the exact same confirm path a real webhook would take.
   */
  async simulatePayment(token: string) {
    if (!this.sandbox) {
      throw apiError(HttpStatus.FORBIDDEN, 'SANDBOX_ONLY', 'Туршилтын горим идэвхгүй байна.', 'Sandbox mode is disabled.');
    }
    const link = await this.prisma.shortLink.findUnique({
      where: { tokenHash: sha256(token) },
      include: { invoice: true },
    });
    if (!link) throw apiError(HttpStatus.NOT_FOUND, 'LINK_INVALID', 'Холбоос хүчингүй байна.', 'Invalid link.');

    const intent = await this.prisma.paymentIntent.findFirst({
      where: { invoiceId: link.invoiceId, state: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!intent?.providerInvoiceId) {
      throw apiError(HttpStatus.CONFLICT, 'NO_PENDING_INTENT', 'Эхлээд төлбөрийн QR үүсгэнэ үү.', 'Create a payment intent first.');
    }
    const marker = this.qpay.simulatePayment(intent.providerInvoiceId);
    if (!marker) {
      throw apiError(HttpStatus.CONFLICT, 'PROVIDER_UNKNOWN_INVOICE', 'Provider дээр нэхэмжлэх олдсонгүй.', 'Provider does not know this invoice.');
    }
    return this.confirmIntent(intent.id, 'sandbox.simulated');
  }

  /**
   * Confirm flow (PAY-03/PAY-04): record the callback event, re-verify with the
   * provider, then commit the transaction + balance + receipt atomically.
   * Idempotent: the unique (provider, providerPaymentId) constraint plus the
   * state guard make duplicate/out-of-order callbacks harmless.
   */
  async confirmIntent(intentId: string, source: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) throw apiError(HttpStatus.NOT_FOUND, 'INTENT_NOT_FOUND', 'Төлбөрийн хүсэлт олдсонгүй.', 'Payment intent not found.');

    await this.prisma.paymentEvent.create({
      data: { intentId, type: `callback.received`, payload: { source } },
    });

    if (intent.state === 'SUCCEEDED') {
      return { intentId, state: 'SUCCEEDED' as const, duplicate: true };
    }
    if (!intent.providerInvoiceId || !['PENDING', 'PROCESSING'].includes(intent.state)) {
      throw apiError(HttpStatus.CONFLICT, 'INTENT_NOT_CONFIRMABLE', 'Төлбөрийн хүсэлт баталгаажих төлөвт алга.', `Intent is ${intent.state}.`);
    }

    // Authoritative provider check — never trust the callback alone.
    const status = await this.qpay.getPaymentStatus(intent.providerInvoiceId);
    if (!status.paid || !status.providerPaymentId) {
      await this.prisma.paymentEvent.create({ data: { intentId, type: 'payment_check.unpaid' } });
      return { intentId, state: intent.state, verified: false };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // State guard: only one concurrent confirm can win this update.
        const claimed = await tx.paymentIntent.updateMany({
          where: { id: intentId, state: { in: ['PENDING', 'PROCESSING'] } },
          data: { state: 'SUCCEEDED' },
        });
        if (claimed.count === 0) return; // someone else already confirmed

        const gross = status.gross ?? intent.amount;
        const fee = status.fee ?? 0;
        const txRow = await tx.paymentTransaction.create({
          data: {
            intentId,
            provider: intent.provider,
            providerPaymentId: status.providerPaymentId!,
            gross,
            fee,
            net: gross - fee,
            paidAt: status.paidAt ?? new Date(),
          },
        });

        // Ledger-derived balance (PRD §7.3): sum confirmed transactions.
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: intent.invoiceId } });
        const agg = await tx.paymentTransaction.aggregate({
          where: { intent: { is: { invoiceId: invoice.id } }, status: 'SUCCEEDED' },
          _sum: { gross: true },
        });
        const paidTotal = agg._sum.gross ?? 0;
        const balance = Math.max(0, invoice.amount - paidTotal);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            balance,
            state: balance === 0 ? 'PAID' : 'PARTIALLY_PAID',
            paidAt: balance === 0 ? (status.paidAt ?? new Date()) : invoice.paidAt,
          },
        });

        await tx.usageEvent.create({
          data: {
            tenantId: intent.tenantId,
            meterCode: 'PAYMENT_SUCCEEDED',
            qty: 1,
            sourceEventId: `pay:${txRow.id}`,
          },
        });
        await tx.paymentEvent.create({
          data: { intentId, type: 'payment.succeeded', payload: { providerPaymentId: status.providerPaymentId, gross } },
        });

        // eBarimt: payment stays PAID even if the receipt provider is down —
        // the receipt is created PENDING and retried (PRD §5.7).
        await this.receipts.createForTransaction(tx, {
          tenantId: intent.tenantId,
          transactionId: txRow.id,
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Duplicate providerPaymentId — replayed callback; financially a no-op.
        this.logger.warn(`Duplicate payment callback suppressed for intent ${intentId}`);
        return { intentId, state: 'SUCCEEDED' as const, duplicate: true };
      }
      throw e;
    }

    await this.receipts.processPending(intent.tenantId).catch((err) => {
      this.logger.error(`eBarimt processing failed (will retry later): ${err?.message}`);
    });

    return { intentId, state: 'SUCCEEDED' as const };
  }

  /** Payer-side polling: bounded status check for the pay page. */
  async checkToken(token: string) {
    const link = await this.prisma.shortLink.findUnique({
      where: { tokenHash: sha256(token) },
      select: { invoiceId: true },
    });
    if (!link) throw apiError(HttpStatus.NOT_FOUND, 'LINK_INVALID', 'Холбоос хүчингүй байна.', 'Invalid link.');
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { invoiceId: link.invoiceId },
      orderBy: { createdAt: 'desc' },
      include: { transactions: { include: { receipts: true } } },
    });
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: link.invoiceId },
      select: { state: true, balance: true },
    });
    const receipt = intent?.transactions[0]?.receipts[0];
    return {
      invoiceState: invoice.state,
      balance: invoice.balance,
      intentState: intent?.state ?? null,
      receipt: receipt ? { receiptNo: receipt.receiptNo, lottery: receipt.lottery, qrData: receipt.qrData, state: receipt.state } : null,
    };
  }

  // -------------------------------------------------------------- merchant

  async list(tenantId: string, take = 50, skip = 0) {
    const where: Prisma.PaymentTransactionWhereInput = { intent: { is: { tenantId } } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.paymentTransaction.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        take: Math.min(take, 200),
        skip,
        include: {
          intent: {
            select: {
              provider: true,
              invoice: { select: { id: true, number: true, customer: { select: { name: true } } } },
            },
          },
          receipts: { select: { state: true, receiptNo: true } },
        },
      }),
      this.prisma.paymentTransaction.count({ where }),
    ]);
    return { items, total };
  }

  async webhook(rawBody: Buffer | undefined, signature: string | undefined, payload: { providerInvoiceId?: string }) {
    const secret = this.config.getOrThrow<string>('WEBHOOK_SIGNING_SECRET');
    const body = rawBody?.toString('utf8') ?? JSON.stringify(payload ?? {});
    const expected = sha256(`${secret}.${body}`);
    if (!signature || signature !== expected) {
      // PAY-02: invalid callbacks are blocked and audited.
      await this.prisma.auditLog.create({
        data: { action: 'webhook.rejected', targetType: 'webhook', meta: { reason: 'bad_signature' } },
      });
      throw apiError(HttpStatus.UNAUTHORIZED, 'BAD_SIGNATURE', 'Гарын үсэг буруу.', 'Invalid webhook signature.');
    }
    if (!payload?.providerInvoiceId) {
      throw apiError(HttpStatus.BAD_REQUEST, 'BAD_PAYLOAD', 'providerInvoiceId дутуу.', 'providerInvoiceId is required.');
    }
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { provider_providerInvoiceId: { provider: this.qpay.code, providerInvoiceId: payload.providerInvoiceId } },
    });
    if (!intent) {
      throw apiError(HttpStatus.NOT_FOUND, 'INTENT_NOT_FOUND', 'Төлбөрийн хүсэлт олдсонгүй.', 'Unknown provider invoice.');
    }
    return this.confirmIntent(intent.id, 'webhook');
  }
}
