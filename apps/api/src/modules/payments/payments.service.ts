import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID, timingSafeEqual } from 'crypto';
import { apiError } from '../../common/filters/http-exception.filter';
import { hmacSign, sha256 } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhooksService } from '../developers/webhooks.service';
import { BonumAdapter } from '../providers/bonum.adapter';
import { MockQpayAdapter } from '../providers/mock-qpay.adapter';
import { ProviderPaymentStatus } from '../providers/payment-provider.port';
import { ProviderResolver } from '../providers/provider-resolver.service';
import { ReceiptsService } from '../receipts/receipts.service';

/** Bounded provider re-check from payer-page polling (callback backstop). */
const POLL_RECHECK_MS = 15_000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly lastProviderCheck = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ProviderResolver,
    private readonly mockAdapter: MockQpayAdapter,
    private readonly bonumAdapter: BonumAdapter,
    private readonly receipts: ReceiptsService,
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService,
  ) {}

  /** Simulation is available only on the mock provider with sandbox on. */
  private async isSandbox(tenantId: string): Promise<boolean> {
    const port = await this.resolver.getPaymentPort(tenantId);
    return port.code === 'qpay_mock' && this.config.get('PAYMENT_SANDBOX') === 'true';
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
            paymentUrl: activeIntent.paymentUrl,
            expiresAt: activeIntent.expiresAt,
          }
        : null,
      receipt: receipt
        ? { receiptNo: receipt.receiptNo, lottery: receipt.lottery, qrData: receipt.qrData, state: receipt.state }
        : null,
      sandbox: await this.isSandbox(invoice.tenantId),
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

    const provider = await this.resolver.getPaymentPort(invoice.tenantId);

    // Latest open intent for the active provider (may hold an expired link).
    const existing = await this.prisma.paymentIntent.findFirst({
      where: {
        invoiceId: invoice.id,
        provider: provider.code,
        state: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      // Still live → reuse (one QR/link per invoice).
      if (existing.state === 'PENDING' && existing.expiresAt && existing.expiresAt > new Date()) {
        return this.intentView(existing.id);
      }
      // Provider links (Bonum) are short-lived: when the payer returns days
      // later the old link is likely dead. Before regenerating, re-verify the
      // stale invoice — the payer may have paid while callbacks were missed.
      if (existing.providerInvoiceId) {
        const confirmed = await this.confirmIntent(existing.id, 'link_regenerate').catch(() => null);
        if (confirmed?.state === 'SUCCEEDED') {
          throw apiError(HttpStatus.CONFLICT, 'NOT_PAYABLE', 'Энэ нэхэмжлэх аль хэдийн төлөгдсөн байна.', 'Invoice is already paid.');
        }
      }
      // Definitely unpaid → retire the stale intent and cut a fresh link below.
      const retired = await this.prisma.paymentIntent.updateMany({
        where: { id: existing.id, state: { in: ['PENDING', 'PROCESSING'] } },
        data: { state: 'EXPIRED' },
      });
      if (retired.count > 0) {
        await this.prisma.paymentEvent.create({
          data: { intentId: existing.id, type: 'intent.expired', payload: { reason: 'provider_link_expired' } },
        });
        if (existing.providerInvoiceId) {
          await provider.cancelInvoice(existing.providerInvoiceId, existing.tenantId).catch(() => undefined);
        }
      }
    }

    // Create the intent row first so the provider callback URL can carry its id.
    const intent = await this.prisma.paymentIntent.create({
      data: {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        amount: invoice.balance,
        provider: provider.code,
        state: 'CREATED',
        idemKey: randomUUID(),
        events: { create: { type: 'intent.created' } },
      },
    });

    const publicUrl = (this.config.get<string>('PUBLIC_URL') ?? '').replace(/\/$/, '');
    let providerInvoice;
    try {
      providerInvoice = await provider.createInvoice({
        tenantId: invoice.tenantId,
        amount: invoice.balance,
        description: `${invoice.number} ${invoice.description}`.slice(0, 100),
        internalRef: intent.id,
        // Hosted-checkout providers (Bonum) send the payer back to OUR page.
        returnUrl: `${publicUrl}/p/${token}`,
      });
    } catch (e: any) {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { state: 'FAILED', events: { create: { type: 'provider.create_failed', payload: { error: String(e?.message).slice(0, 300) } } } },
      });
      this.logger.error(`Provider invoice create failed: ${e?.message}`);
      throw apiError(
        HttpStatus.BAD_GATEWAY,
        'PROVIDER_ERROR',
        'Төлбөрийн систем түр хариу өгсөнгүй. Дахин оролдоно уу.',
        'Payment provider is temporarily unavailable.',
      );
    }

    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        providerInvoiceId: providerInvoice.providerInvoiceId,
        qrText: providerInvoice.qrText,
        paymentUrl: providerInvoice.paymentUrl ?? null,
        expiresAt: providerInvoice.expiresAt,
        state: 'PENDING',
        events: { create: { type: 'provider.invoice_created', payload: { providerInvoiceId: providerInvoice.providerInvoiceId } } },
      },
    });
    return { ...(await this.intentView(intent.id)), deeplinks: providerInvoice.deeplinks };
  }

  private async intentView(intentId: string) {
    const intent = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    return {
      intentId: intent.id,
      state: intent.state,
      amount: intent.amount,
      qrText: intent.qrText,
      paymentUrl: intent.paymentUrl,
      expiresAt: intent.expiresAt,
    };
  }

  /**
   * Sandbox-only: simulate the payer completing the payment in their bank app.
   * Goes through the exact same confirm path a real webhook would take.
   */
  async simulatePayment(token: string) {
    const link = await this.prisma.shortLink.findUnique({
      where: { tokenHash: sha256(token) },
      include: { invoice: true },
    });
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) {
      throw apiError(HttpStatus.NOT_FOUND, 'LINK_INVALID', 'Холбоос хүчингүй байна.', 'Invalid link.');
    }
    if (!(await this.isSandbox(link.invoice.tenantId))) {
      throw apiError(HttpStatus.FORBIDDEN, 'SANDBOX_ONLY', 'Туршилтын горим идэвхгүй байна.', 'Sandbox mode is disabled.');
    }

    const intent = await this.prisma.paymentIntent.findFirst({
      where: { invoiceId: link.invoiceId, state: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!intent?.providerInvoiceId) {
      throw apiError(HttpStatus.CONFLICT, 'NO_PENDING_INTENT', 'Эхлээд төлбөрийн QR үүсгэнэ үү.', 'Create a payment intent first.');
    }
    const marker = this.mockAdapter.simulatePayment(intent.providerInvoiceId);
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
   *
   * `verifiedStatus` — цорын ганц зөвшөөрөгдөх эх сурвалж нь CHECKSUM-аар
   * баталгаажсан Bonum webhook (Bonum §3.3: status endpoint нь production-д
   * хориотой тул криптографаар баталгаажсан webhook нь мөнгөний үнэн болно).
   */
  async confirmIntent(intentId: string, source: string, verifiedStatus?: ProviderPaymentStatus) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) throw apiError(HttpStatus.NOT_FOUND, 'INTENT_NOT_FOUND', 'Төлбөрийн хүсэлт олдсонгүй.', 'Payment intent not found.');

    if (source !== 'poll') {
      await this.prisma.paymentEvent.create({
        data: { intentId, type: 'callback.received', payload: { source } },
      });
    }

    if (intent.state === 'SUCCEEDED') {
      return { intentId, state: 'SUCCEEDED' as const, duplicate: true };
    }
    if (!intent.providerInvoiceId || !['PENDING', 'PROCESSING'].includes(intent.state)) {
      throw apiError(HttpStatus.CONFLICT, 'INTENT_NOT_CONFIRMABLE', 'Төлбөрийн хүсэлт баталгаажих төлөвт алга.', `Intent is ${intent.state}.`);
    }

    // Authoritative check: a checksum-verified webhook, otherwise the provider
    // API — a bare (unverified) callback is never trusted on its own.
    this.lastProviderCheck.set(intentId, Date.now());
    // Resolve by the intent's RECORDED provider — the tenant may have switched
    // providers since this intent was cut.
    const provider =
      intent.provider === 'qpay_mock'
        ? this.mockAdapter
        : intent.provider === 'bonum'
          ? this.bonumAdapter
          : await this.resolver.getPaymentPort(intent.tenantId);
    const status = verifiedStatus ?? (await provider.getPaymentStatus(intent.providerInvoiceId, intent.tenantId));
    if (!status.paid || !status.providerPaymentId) {
      if (source !== 'poll') {
        await this.prisma.paymentEvent.create({ data: { intentId, type: 'payment_check.unpaid' } });
      }
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
          invoiceOptIn: invoice.ebarimtEnabled,
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

    // Merchant outbound webhook (PRD §9.3) — fire-and-forget.
    const invoiceRow = await this.prisma.invoice.findUnique({
      where: { id: intent.invoiceId },
      select: { id: true, number: true, amount: true, balance: true, state: true },
    });
    this.webhooks.emit(intent.tenantId, 'payment.succeeded', {
      invoice_id: intent.invoiceId,
      invoice_number: invoiceRow?.number,
      amount: status.gross ?? intent.amount,
      provider: intent.provider,
      provider_payment_id: status.providerPaymentId,
      invoice_state: invoiceRow?.state,
    });

    return { intentId, state: 'SUCCEEDED' as const };
  }

  /**
   * QPay GET callback. The spec requires HTTP 200 body "SUCCESS"; the callback
   * itself is only a trigger — payment truth comes from payment/check.
   */
  async handleQpayCallback(intentId: string | undefined): Promise<string> {
    if (intentId) {
      try {
        await this.confirmIntent(intentId, 'qpay_callback');
      } catch (e: any) {
        // Never fail the callback response — the poll backstop re-checks.
        this.logger.warn(`QPay callback processing for ${intentId}: ${e?.message}`);
      }
    }
    return 'SUCCESS';
  }

  /**
   * Bonum webhook (registered with Bonum by emailing our WEBHOOK URL). The
   * checksum (MERCHANT_CHECKSUM_KEY) result is recorded for audit, but the
   * webhook stays a trigger only — payment truth comes from the invoice-check
   * API inside confirmIntent, so a forged/malformed callback can never credit
   * money on its own.
   */
  async handleBonumCallback(rawBody: Buffer | undefined, checksum: string | undefined, intentId: string | undefined, body: any) {
    const webhook = this.bonumAdapter.parseWebhook(body);

    // Locate the intent: our query hint, then §7 body.invoiceId (= the stored
    // providerInvoiceId — the pre-registered webhook URL carries no intent id).
    let intent = intentId ? await this.prisma.paymentIntent.findUnique({ where: { id: intentId } }) : null;
    if (!intent && webhook?.invoiceId) {
      intent = await this.prisma.paymentIntent.findUnique({
        where: { provider_providerInvoiceId: { provider: 'bonum', providerInvoiceId: webhook.invoiceId } },
      });
    }

    // §7: x-checksum-v2 = hex(HMAC-SHA256(rawBody, MERCHANT_CHECKSUM_KEY)).
    // Key is per-tenant (own terminal), env fallback.
    const raw = rawBody?.toString('utf8') ?? (body ? JSON.stringify(body) : '');
    const verdict = await this.bonumAdapter.verifyChecksum(raw, checksum, intent?.tenantId);
    if (!verdict.valid) {
      this.logger.warn(`Bonum webhook checksum not verified (scheme=${verdict.scheme ?? 'none'})`);
      await this.prisma.auditLog.create({
        data: { action: 'webhook.checksum_unverified', targetType: 'webhook', meta: { provider: 'bonum' } },
      });
    }

    if (intent && webhook?.type === 'PAYMENT') {
      try {
        if (verdict.valid && webhook.paid) {
          // Checksum-authenticated SUCCESS webhook is authoritative (§3.3
          // forbids the status endpoint in production).
          await this.confirmIntent(intent.id, 'bonum_webhook', {
            paid: true,
            providerPaymentId: webhook.transactionId ?? webhook.invoiceId ?? intent.id,
            gross: webhook.amount ?? undefined,
            paidAt: webhook.completedAt ?? new Date(),
          });
        } else if (verdict.valid && webhook.status.toUpperCase() === 'FAILED' && webhook.invoiceStatus?.toUpperCase() === 'EXPIRED') {
          // Invoice expired unpaid — retire the intent; a fresh link is cut on
          // the payer's next visit.
          await this.prisma.paymentIntent.updateMany({
            where: { id: intent.id, state: { in: ['PENDING', 'PROCESSING'] } },
            data: { state: 'EXPIRED' },
          });
          await this.prisma.paymentEvent.create({
            data: { intentId: intent.id, type: 'intent.expired', payload: { reason: 'bonum_webhook_expired' } },
          });
        } else {
          // Unverified checksum → treat as a bare trigger: re-check via API.
          await this.confirmIntent(intent.id, 'bonum_callback');
        }
      } catch (e: any) {
        // Never fail the callback response — the poll backstop re-checks.
        this.logger.warn(`Bonum callback processing for ${intent.id}: ${e?.message}`);
      }
    } else if (!intent) {
      this.logger.warn('Bonum webhook received for unknown invoice');
    }
    return 'SUCCESS';
  }

  /** Payer-side polling: bounded status check for the pay page. */
  async checkToken(token: string) {
    const link = await this.prisma.shortLink.findUnique({
      where: { tokenHash: sha256(token) },
      select: { invoiceId: true, revokedAt: true, expiresAt: true },
    });
    // Цуцалсан нэхэмжлэхийн (revoke хийсэн) болон хугацаа дууссан линк төлөв,
    // eBarimt зэрэг мэдээлэл буцаахгүй — resolveToken-той ижил дүрэм.
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) {
      throw apiError(HttpStatus.NOT_FOUND, 'LINK_INVALID', 'Холбоос хүчингүй байна.', 'Invalid link.');
    }
    let intent = await this.prisma.paymentIntent.findFirst({
      where: { invoiceId: link.invoiceId },
      orderBy: { createdAt: 'desc' },
      include: { transactions: { include: { receipts: true } } },
    });

    // Callback backstop: while an intent is pending on a REAL provider, poll
    // requests may trigger a provider re-check at most every 15 seconds.
    if (
      intent &&
      intent.providerInvoiceId &&
      ['PENDING', 'PROCESSING'].includes(intent.state) &&
      intent.provider !== 'qpay_mock' &&
      Date.now() - (this.lastProviderCheck.get(intent.id) ?? 0) > POLL_RECHECK_MS
    ) {
      await this.confirmIntent(intent.id, 'poll').catch(() => undefined);
      intent = await this.prisma.paymentIntent.findFirst({
        where: { invoiceId: link.invoiceId },
        orderBy: { createdAt: 'desc' },
        include: { transactions: { include: { receipts: true } } },
      });
    }

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

  /** Legacy HMAC-signed webhook (mock provider / internal integrations). */
  async webhook(rawBody: Buffer | undefined, signature: string | undefined, payload: { providerInvoiceId?: string }) {
    const secret = this.config.getOrThrow<string>('WEBHOOK_SIGNING_SECRET');
    const body = rawBody?.toString('utf8') ?? JSON.stringify(payload ?? {});
    // OWASP A02/A08: жинхэнэ HMAC (length-extension-д тэсвэртэй) + хуучин
    // sha256(secret.body) хэлбэрийг хоёуланг нь хүлээн авна (илгээгчид эвдрэхгүй),
    // харьцуулалт нь timing-safe.
    const accepted = [hmacSign(secret, body), sha256(`${secret}.${body}`)];
    const sigBuf = Buffer.from(signature ?? '', 'utf8');
    const valid = accepted.some((exp) => {
      const expBuf = Buffer.from(exp, 'utf8');
      return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
    });
    if (!valid) {
      await this.prisma.auditLog.create({
        data: { action: 'webhook.rejected', targetType: 'webhook', meta: { reason: 'bad_signature' } },
      });
      throw apiError(HttpStatus.UNAUTHORIZED, 'BAD_SIGNATURE', 'Гарын үсэг буруу.', 'Invalid webhook signature.');
    }
    if (!payload?.providerInvoiceId) {
      throw apiError(HttpStatus.BAD_REQUEST, 'BAD_PAYLOAD', 'providerInvoiceId дутуу.', 'providerInvoiceId is required.');
    }
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { providerInvoiceId: payload.providerInvoiceId },
    });
    if (!intent) {
      throw apiError(HttpStatus.NOT_FOUND, 'INTENT_NOT_FOUND', 'Төлбөрийн хүсэлт олдсонгүй.', 'Unknown provider invoice.');
    }
    return this.confirmIntent(intent.id, 'webhook');
  }
}
