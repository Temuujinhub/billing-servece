import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { KybStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { MockQpayAdapter } from '../providers/mock-qpay.adapter';
import { ProviderConfigService } from '../providers/provider-config.service';
import { QpayAdapter } from '../providers/qpay.adapter';
import { MessagingService } from '../messaging/messaging.service';
import { PaymentsService } from '../payments/payments.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { PRICING as DEFAULT_PRICING, EbarimtTier } from '../billing/billing.service';

/** Тарифын default — billing.service-ийн PRICING нэг эх сурвалж. */
export { DEFAULT_PRICING };

export const DEFAULT_FEATURES = {
  registrationOpen: true,
  reminderBeta: false,
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly receiptsSvc: ReceiptsService,
    private readonly messaging: MessagingService,
    private readonly providerConfigs: ProviderConfigService,
    private readonly qpay: QpayAdapter,
    private readonly qpayMock: MockQpayAdapter,
  ) {}

  private audit(actor: AuthUser, action: string, targetType: string, targetId: string, meta?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({
      data: { actorId: actor.userId, actorEmail: actor.email, action, targetType, targetId, meta },
    });
  }

  // ----------------------------------------------------- merchants & KYB (A-03..A-06)

  async merchants(search?: string, kyb?: string, take = 50, skip = 0) {
    const where: Prisma.TenantWhereInput = {};
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { regNo: { contains: search.trim() } },
        { contactEmail: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }
    if (kyb && kyb !== 'ALL') where.kybStatus = kyb as KybStatus;
    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(take, 200),
        skip,
        select: {
          id: true, name: true, regNo: true, status: true, kybStatus: true, contactEmail: true, createdAt: true,
          _count: { select: { invoices: true, customers: true, memberships: true } },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return { items, total };
  }

  async merchant360(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        modules: true,
        memberships: { include: { user: { select: { id: true, name: true, email: true, platformAdmin: true } } } },
        _count: { select: { invoices: true, customers: true, batches: true } },
      },
    });
    if (!tenant) throw apiError(HttpStatus.NOT_FOUND, 'TENANT_NOT_FOUND', 'Байгууллага олдсонгүй.', 'Tenant not found.');
    const [invoiceAgg, paidAgg, recentInvoices, recentAudit, providerStates] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { tenantId: id }, _sum: { amount: true, balance: true } }),
      this.prisma.paymentTransaction.aggregate({
        where: { intent: { is: { tenantId: id } }, status: 'SUCCEEDED' },
        _sum: { gross: true }, _count: { _all: true },
      }),
      this.prisma.invoice.findMany({
        where: { tenantId: id }, orderBy: { createdAt: 'desc' }, take: 10,
        include: { customer: { select: { name: true } } },
      }),
      this.prisma.auditLog.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' }, take: 15 }),
      Promise.all([this.providerConfigs.getQpay(id), this.providerConfigs.getCallpro(id)]),
    ]);
    return {
      tenant,
      stats: {
        invoicedTotal: invoiceAgg._sum.amount ?? 0,
        outstanding: invoiceAgg._sum.balance ?? 0,
        collected: paidAgg._sum.gross ?? 0,
        payments: paidAgg._count._all,
      },
      providers: {
        qpay: { enabled: providerStates[0].enabled, source: providerStates[0].source },
        callpro: { enabled: providerStates[1].enabled, source: providerStates[1].source },
      },
      recentInvoices,
      recentAudit,
    };
  }

  async kybAction(actor: AuthUser, tenantId: string, action: 'APPROVE' | 'REJECT' | 'NEEDS_INFO' | 'UNDER_REVIEW' | 'SUSPEND' | 'ACTIVATE', reason?: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw apiError(HttpStatus.NOT_FOUND, 'TENANT_NOT_FOUND', 'Байгууллага олдсонгүй.', 'Tenant not found.');
    if ((action === 'REJECT' || action === 'NEEDS_INFO' || action === 'SUSPEND') && !reason?.trim()) {
      throw apiError(HttpStatus.BAD_REQUEST, 'REASON_REQUIRED', 'Шалтгаан заавал бичнэ (audit).', 'Reason is required.');
    }
    const data: Prisma.TenantUpdateInput =
      action === 'APPROVE' ? { kybStatus: 'APPROVED' }
      : action === 'REJECT' ? { kybStatus: 'REJECTED' }
      : action === 'NEEDS_INFO' ? { kybStatus: 'NEEDS_INFO' }
      : action === 'UNDER_REVIEW' ? { kybStatus: 'UNDER_REVIEW' }
      : action === 'SUSPEND' ? { status: 'SUSPENDED' }
      : { status: 'ACTIVE' };
    const updated = await this.prisma.tenant.update({ where: { id: tenantId }, data });
    await this.audit(actor, `kyb.${action.toLowerCase()}`, 'tenant', tenantId, reason ? { reason } : undefined);
    return updated;
  }

  async setTenantModule(actor: AuthUser, tenantId: string, code: string, enabled: boolean, quantity?: number) {
    const module = await this.prisma.tenantModule.upsert({
      where: { tenantId_code: { tenantId, code } },
      create: { tenantId, code, enabled, quantity: quantity ?? (enabled ? 1 : 0) },
      update: { enabled, quantity: quantity ?? undefined },
    });
    // Үйлчилгээ 3-ыг анх идэвхжүүлэхэд onboarding хураамж (нэг л удаа) бүртгэнэ.
    if (code === 'EBARIMT_API' && enabled) {
      const pricing = await this.getPricing();
      const exists = await this.prisma.serviceCharge.findFirst({ where: { tenantId, code: 'EBARIMT_API_ONBOARDING' } });
      if (!exists && pricing.EBARIMT_API_ONBOARDING > 0) {
        await this.prisma.serviceCharge.create({
          data: {
            tenantId,
            code: 'EBARIMT_API_ONBOARDING',
            label: 'eBarimt API интеграцийн хураамж (нэг удаа)',
            amount: pricing.EBARIMT_API_ONBOARDING,
          },
        });
      }
    }
    await this.audit(actor, enabled ? 'admin.module.enabled' : 'admin.module.disabled', 'module', `${tenantId}:${code}`);
    return module;
  }

  // ------------------------------------------------- transactions (A-07..A-09)

  async transactions(q: { state?: string; provider?: string; search?: string; take?: number; skip?: number }) {
    const where: Prisma.PaymentIntentWhereInput = {};
    if (q.state && q.state !== 'ALL') where.state = q.state as any;
    if (q.provider && q.provider !== 'ALL') where.provider = q.provider;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { providerInvoiceId: { contains: s } },
        { transactions: { some: { providerPaymentId: { contains: s } } } },
        { invoice: { is: { number: { contains: s, mode: 'insensitive' } } } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.paymentIntent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(q.take ?? 50, 200),
        skip: q.skip ?? 0,
        include: {
          invoice: { select: { number: true, tenant: { select: { id: true, name: true } } } },
          transactions: { select: { id: true, providerPaymentId: true, gross: true, status: true, refundedAt: true } },
        },
      }),
      this.prisma.paymentIntent.count({ where }),
    ]);
    return { items, total };
  }

  /** Forensic timeline (A-08): everything we know about one intent. */
  async transaction(intentId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: intentId },
      include: {
        invoice: { include: { customer: true, tenant: { select: { id: true, name: true } } } },
        transactions: { include: { receipts: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!intent) throw apiError(HttpStatus.NOT_FOUND, 'INTENT_NOT_FOUND', 'Гүйлгээ олдсонгүй.', 'Intent not found.');
    return intent;
  }

  /** Manual provider re-verification (never a blind override). */
  async recheck(actor: AuthUser, intentId: string) {
    await this.audit(actor, 'admin.payment.recheck', 'intent', intentId);
    return this.payments.confirmIntent(intentId, 'admin.recheck');
  }

  /**
   * Refund (A-09): provider refund first, then ledger + invoice + receipt in
   * one transaction. Reason is mandatory (four-eyes lite: audited admin action).
   */
  async refund(actor: AuthUser, transactionId: string, reason: string) {
    if (!reason?.trim()) {
      throw apiError(HttpStatus.BAD_REQUEST, 'REASON_REQUIRED', 'Буцаалтын шалтгаан заавал.', 'Refund reason is required.');
    }
    const tx = await this.prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
      include: { intent: true, receipts: true },
    });
    if (!tx) throw apiError(HttpStatus.NOT_FOUND, 'TX_NOT_FOUND', 'Гүйлгээ олдсонгүй.', 'Transaction not found.');
    if (tx.status !== 'SUCCEEDED') {
      throw apiError(HttpStatus.CONFLICT, 'NOT_REFUNDABLE', `Гүйлгээ ${tx.status} төлөвтэй тул буцаах боломжгүй.`, 'Only SUCCEEDED transactions can be refunded.');
    }

    const adapter = tx.provider === 'qpay' ? this.qpay : this.qpayMock;
    try {
      await adapter.refundPayment(tx.providerPaymentId, tx.intent.tenantId, reason.trim().slice(0, 100));
    } catch (e: any) {
      throw apiError(HttpStatus.BAD_GATEWAY, 'PROVIDER_REFUND_FAILED', `Provider буцаалт амжилтгүй: ${String(e?.message).slice(0, 160)}`, 'Provider refund failed.');
    }

    await this.prisma.$transaction(async (db) => {
      await db.paymentTransaction.update({
        where: { id: transactionId },
        data: { status: 'REFUNDED', refundedAt: new Date(), refundReason: reason.trim() },
      });
      // Ledger-derived balance excludes refunded rows.
      const invoice = await db.invoice.findUniqueOrThrow({ where: { id: tx.intent.invoiceId } });
      const agg = await db.paymentTransaction.aggregate({
        where: { intent: { is: { invoiceId: invoice.id } }, status: 'SUCCEEDED' },
        _sum: { gross: true },
      });
      const paidTotal = agg._sum.gross ?? 0;
      const balance = Math.max(0, invoice.amount - paidTotal);
      await db.invoice.update({
        where: { id: invoice.id },
        data: {
          balance,
          state: balance === 0 ? 'PAID' : paidTotal > 0 ? 'PARTIALLY_PAID' : 'SENT',
          paidAt: balance === 0 ? invoice.paidAt : null,
        },
      });
      await db.paymentEvent.create({
        data: { intentId: tx.intentId, type: 'refund.succeeded', payload: { by: actor.email, reason: reason.trim() } },
      });
    });

    // Tax receipt: cancel best-effort; provider hiccups leave CANCEL_PENDING.
    const receipt = tx.receipts[0];
    if (receipt && ['CREATED', 'DELIVERED'].includes(receipt.state)) {
      try {
        if (tx.provider === 'qpay') await this.qpay.cancelEbarimt(tx.intent.tenantId, tx.providerPaymentId);
        await this.prisma.ebarimtReceipt.update({ where: { id: receipt.id }, data: { state: 'CANCELLED' } });
      } catch (e: any) {
        await this.prisma.ebarimtReceipt.update({
          where: { id: receipt.id },
          data: { state: 'CANCEL_PENDING', error: String(e?.message).slice(0, 300) },
        });
      }
    }

    await this.audit(actor, 'admin.payment.refunded', 'transaction', transactionId, { reason: reason.trim(), gross: tx.gross });
    return this.transaction(tx.intentId);
  }

  // --------------------------------------------- ops queues (A-10, A-11, A-18)

  async receiptQueue(state?: string, take = 100) {
    const where: Prisma.EbarimtReceiptWhereInput =
      state && state !== 'ALL' ? { state: state as any } : { state: { in: ['PENDING', 'FAILED', 'CANCEL_PENDING'] } };
    return this.prisma.ebarimtReceipt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        transaction: {
          select: {
            gross: true, providerPaymentId: true,
            intent: { select: { tenantId: true, invoice: { select: { number: true, tenant: { select: { name: true } } } } } },
          },
        },
      },
    });
  }

  async retryReceipt(actor: AuthUser, receiptId: string) {
    const receipt = await this.prisma.ebarimtReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt) throw apiError(HttpStatus.NOT_FOUND, 'RECEIPT_NOT_FOUND', 'Баримт олдсонгүй.', 'Receipt not found.');
    await this.prisma.ebarimtReceipt.updateMany({
      where: { id: receiptId, state: { in: ['FAILED', 'CANCEL_PENDING'] } },
      data: { state: receipt.state === 'CANCEL_PENDING' ? 'CANCEL_PENDING' : 'PENDING', retries: 0 },
    });
    await this.audit(actor, 'admin.receipt.retry', 'receipt', receiptId);
    return this.receiptsSvc.processPending(receipt.tenantId);
  }

  async messageQueue(status?: string, take = 100) {
    const where: Prisma.MessageJobWhereInput =
      status && status !== 'ALL' ? { status: status as any } : { status: { in: ['FAILED', 'QUEUED'] } };
    return this.prisma.messageJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: { invoice: { select: { number: true, tenant: { select: { name: true } } } } },
    });
  }

  async retryMessage(actor: AuthUser, jobId: string) {
    const job = await this.prisma.messageJob.findUnique({ where: { id: jobId } });
    if (!job) throw apiError(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Мессеж олдсонгүй.', 'Message job not found.');
    await this.prisma.messageJob.updateMany({ where: { id: jobId, status: 'FAILED' }, data: { status: 'QUEUED', error: null } });
    await this.audit(actor, 'admin.sms.retry', 'message', jobId);
    return this.messaging.dispatchQueued(job.tenantId);
  }

  /** A-18: everything stuck across queues, one view. */
  async eventOps() {
    const [failedIntents, failedSms, failedReceipts] = await Promise.all([
      this.prisma.paymentEvent.findMany({
        where: { type: 'provider.create_failed' },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { intent: { select: { id: true, tenantId: true, invoice: { select: { number: true } } } } },
      }),
      this.prisma.messageJob.count({ where: { status: 'FAILED' } }),
      this.prisma.ebarimtReceipt.count({ where: { state: { in: ['FAILED', 'CANCEL_PENDING'] } } }),
    ]);
    return { failedIntents, failedSms, failedReceipts };
  }

  // ------------------------------------------------ reconciliation (A-12/13)

  /**
   * Ledger-vs-provider sweep over a bounded period: every SUCCEEDED intent is
   * re-verified with payment/check; amount drift or provider-unknown payments
   * become mismatch items. Admin-triggered only (spec forbids blind cron polling).
   */
  async runReconciliation(actor: AuthUser, days: number) {
    const boundedDays = Math.max(1, Math.min(31, days || 7));
    const periodStart = new Date(Date.now() - boundedDays * 864e5);
    const periodEnd = new Date();
    const intents = await this.prisma.paymentIntent.findMany({
      where: { state: 'SUCCEEDED', createdAt: { gte: periodStart }, providerInvoiceId: { not: null } },
      include: {
        transactions: { where: { status: 'SUCCEEDED' } },
        invoice: { select: { number: true, tenant: { select: { name: true } } } },
      },
      take: 500,
    });

    const items: any[] = [];
    let matched = 0;
    for (const intent of intents) {
      const ledgerGross = intent.transactions.reduce((s, t) => s + t.gross, 0);
      try {
        const adapter = intent.provider === 'qpay' ? this.qpay : this.qpayMock;
        const status = await adapter.getPaymentStatus(intent.providerInvoiceId!, intent.tenantId);
        if (!status.paid) {
          items.push({ intentId: intent.id, invoiceNumber: intent.invoice.number, tenantName: intent.invoice.tenant.name, gross: ledgerGross, issue: 'PROVIDER_UNPAID — ledger дээр төлөгдсөн, provider дээр олдсонгүй' });
        } else if ((status.gross ?? 0) !== ledgerGross) {
          items.push({ intentId: intent.id, invoiceNumber: intent.invoice.number, tenantName: intent.invoice.tenant.name, gross: ledgerGross, issue: `AMOUNT_MISMATCH — ledger ${ledgerGross} ≠ provider ${status.gross}` });
        } else {
          matched += 1;
        }
      } catch (e: any) {
        items.push({ intentId: intent.id, invoiceNumber: intent.invoice.number, tenantName: intent.invoice.tenant.name, gross: ledgerGross, issue: `CHECK_ERROR — ${String(e?.message).slice(0, 120)}` });
      }
    }

    const run = await this.prisma.reconciliationRun.create({
      data: {
        provider: 'ALL',
        periodStart,
        periodEnd,
        total: intents.length,
        matched,
        mismatched: items.length,
        items,
        createdBy: actor.email,
      },
    });
    await this.audit(actor, 'admin.reconciliation.run', 'reconciliation', run.id, { total: intents.length, mismatched: items.length });
    return run;
  }

  reconciliationRuns(take = 20) {
    return this.prisma.reconciliationRun.findMany({ orderBy: { createdAt: 'desc' }, take });
  }

  // ------------------------------------------------- provider health (A-14)

  async providerHealth() {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [failedIntents24h, succeeded24h, failedSms24h, sms24h, failedReceipts, tenants] = await Promise.all([
      this.prisma.paymentEvent.count({ where: { type: 'provider.create_failed', createdAt: { gte: since } } }),
      this.prisma.paymentTransaction.count({ where: { createdAt: { gte: since } } }),
      this.prisma.messageJob.count({ where: { status: 'FAILED', updatedAt: { gte: since } } }),
      this.prisma.messageJob.count({ where: { createdAt: { gte: since } } }),
      this.prisma.ebarimtReceipt.count({ where: { state: { in: ['FAILED', 'CANCEL_PENDING'] } } }),
      this.prisma.tenant.count(),
    ]);
    return {
      qpay: { failed24h: failedIntents24h, succeeded24h },
      callpro: { failed24h: failedSms24h, total24h: sms24h },
      ebarimt: { stuck: failedReceipts },
      tenants,
    };
  }

  // ------------------------------------- pricing & feature flags (A-16, A-17)

  private async setting<T>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key } });
    return row ? ({ ...fallback, ...(row.value as any) } as T) : fallback;
  }

  getPricing() {
    return this.setting('pricing', DEFAULT_PRICING);
  }

  async setPricing(actor: AuthUser, value: Partial<typeof DEFAULT_PRICING>) {
    const merged = { ...(await this.getPricing()), ...value };
    const badPrice = () =>
      apiError(HttpStatus.BAD_REQUEST, 'BAD_PRICE', 'Үнэ 0–10,000,000₮ бүхэл тоо байна.', 'Prices must be integers in range.');
    const intPrice = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10_000_000;
    for (const key of ['INVOICE_MSG', 'API_INVOICE_MSG', 'EBARIMT_API_ONBOARDING', 'POS_PER_DEVICE'] as const) {
      if (!intPrice(merged[key])) throw badPrice();
    }
    if (!Number.isInteger(merged.VAT_PERCENT) || merged.VAT_PERCENT < 0 || merged.VAT_PERCENT > 50) {
      throw apiError(HttpStatus.BAD_REQUEST, 'BAD_VAT', 'НӨАТ 0–50% бүхэл тоо байна.', 'VAT percent must be 0–50.');
    }
    // 3 шатлал: хязгаар өсөх дараалалтай, сүүлийнх нь хязгааргүй (null) байж болно.
    const tiers = merged.EBARIMT_API_TIERS as EbarimtTier[];
    if (!Array.isArray(tiers) || tiers.length !== 3) {
      throw apiError(HttpStatus.BAD_REQUEST, 'BAD_TIERS', 'eBarimt API 3 шатлалтай байна.', 'Exactly 3 tiers are required.');
    }
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      if (!intPrice(t?.fee)) throw badPrice();
      const isLast = i === tiers.length - 1;
      if (t.upTo != null && (!Number.isInteger(t.upTo) || t.upTo <= 0 || t.upTo > 1_000_000)) {
        throw apiError(HttpStatus.BAD_REQUEST, 'BAD_TIERS', 'Шатлалын хязгаар 1–1,000,000 бүхэл тоо байна.', 'Tier limits must be positive integers.');
      }
      if (!isLast && t.upTo == null) {
        throw apiError(HttpStatus.BAD_REQUEST, 'BAD_TIERS', 'Зөвхөн сүүлийн шатлал хязгааргүй байж болно.', 'Only the last tier may be unlimited.');
      }
      if (i > 0 && t.upTo != null && tiers[i - 1].upTo != null && t.upTo <= (tiers[i - 1].upTo as number)) {
        throw apiError(HttpStatus.BAD_REQUEST, 'BAD_TIERS', 'Шатлалын хязгаарууд өсөх дараалалтай байна.', 'Tier limits must be ascending.');
      }
    }
    // Платформын нэхэмжлэх гаргагч tenant (Медиа Профессионал ХХК) — байвал шалгана.
    if (merged.BILLER_TENANT_ID != null && merged.BILLER_TENANT_ID !== '') {
      const biller = await this.prisma.tenant.findUnique({ where: { id: merged.BILLER_TENANT_ID } });
      if (!biller) {
        throw apiError(HttpStatus.BAD_REQUEST, 'BILLER_NOT_FOUND', 'Нэхэмжлэгч байгууллага (tenant) олдсонгүй.', 'Biller tenant not found.');
      }
    } else {
      merged.BILLER_TENANT_ID = null;
    }
    await this.prisma.platformSetting.upsert({
      where: { key: 'pricing' },
      create: { key: 'pricing', value: merged },
      update: { value: merged },
    });
    await this.audit(actor, 'admin.pricing.updated', 'setting', 'pricing', merged);
    return merged;
  }

  /** Tenant-тэй тохиролцсон нэгж үнэ / шатлал — админ тохируулна (ж: 75₮/msg гэрээ). */
  async setTenantPricing(actor: AuthUser, tenantId: string, code: string, unitPrice: number | null, tier?: number | null) {
    if (!['EXCEL_SMS', 'API_SMS', 'EBARIMT_API'].includes(code)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'UNKNOWN_MODULE', 'Энэ үйлчилгээнд үнэ тохируулах боломжгүй.', `No per-tenant pricing for ${code}.`);
    }
    if (unitPrice != null && (!Number.isInteger(unitPrice) || unitPrice < 0 || unitPrice > 1_000_000)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'BAD_PRICE', 'Нэгж үнэ 0–1,000,000₮ бүхэл тоо байна.', 'Unit price must be an integer in range.');
    }
    if (tier != null && (tier < 1 || tier > 3)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'BAD_TIER', 'Шатлал 1–3 байна.', 'Tier must be 1..3.');
    }
    const module = await this.prisma.tenantModule.upsert({
      where: { tenantId_code: { tenantId, code } },
      create: { tenantId, code, enabled: false, quantity: 0, unitPrice, tier: tier ?? undefined },
      update: { unitPrice, tier: tier ?? undefined },
    });
    await this.audit(actor, 'admin.tenant_pricing.updated', 'module', `${tenantId}:${code}`, {
      unitPrice,
      tier: module.tier,
    });
    return module;
  }

  getFeatures() {
    return this.setting('features', DEFAULT_FEATURES);
  }

  async setFeatures(actor: AuthUser, value: Partial<typeof DEFAULT_FEATURES>) {
    const merged = { ...(await this.getFeatures()), ...value };
    await this.prisma.platformSetting.upsert({
      where: { key: 'features' },
      create: { key: 'features', value: merged },
      update: { value: merged },
    });
    await this.audit(actor, 'admin.features.updated', 'setting', 'features', merged);
    return merged;
  }

  // --------------------------------------------------- incidents (A-19)

  incidents(status?: string) {
    return this.prisma.incident.findMany({
      where: status && status !== 'ALL' ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createIncident(actor: AuthUser, dto: { title: string; severity?: string; note?: string }) {
    const incident = await this.prisma.incident.create({
      data: {
        title: dto.title.trim(),
        severity: ['SEV1', 'SEV2', 'SEV3', 'SEV4'].includes(dto.severity ?? '') ? dto.severity! : 'SEV3',
        note: dto.note?.trim() || null,
        createdBy: actor.email,
      },
    });
    await this.audit(actor, 'admin.incident.declared', 'incident', incident.id, { severity: incident.severity });
    return incident;
  }

  async updateIncident(actor: AuthUser, id: string, dto: { status?: string; note?: string }) {
    const incident = await this.prisma.incident.update({
      where: { id },
      data: {
        status: dto.status && ['OPEN', 'MONITORING', 'RESOLVED'].includes(dto.status) ? (dto.status as any) : undefined,
        note: dto.note !== undefined ? dto.note?.trim() || null : undefined,
        resolvedAt: dto.status === 'RESOLVED' ? new Date() : undefined,
      },
    });
    await this.audit(actor, 'admin.incident.updated', 'incident', id, { status: incident.status });
    return incident;
  }

  // ------------------------------------------------ support search (A-20)

  /** Cross-tenant lookup; payer phones stay masked (PRD §13.3). */
  async supportSearch(q: string) {
    const s = q.trim();
    if (s.length < 3) {
      throw apiError(HttpStatus.BAD_REQUEST, 'QUERY_TOO_SHORT', 'Хайлт доод тал нь 3 тэмдэгт.', 'Query too short.');
    }
    const digits = s.replace(/[\s\-+]/g, '');
    const mask = (phone: string | null) => (phone ? `${phone.slice(0, 6)}•••${phone.slice(-2)}` : null);
    const [invoices, customers, transactions, tenants] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { OR: [{ number: { contains: s, mode: 'insensitive' } }, { description: { contains: s, mode: 'insensitive' } }] },
        take: 10,
        include: { tenant: { select: { name: true } }, customer: { select: { name: true } } },
      }),
      /^\d{4,}$/.test(digits)
        ? this.prisma.customer.findMany({ where: { phone: { contains: digits.slice(-8) } }, take: 10, include: { tenant: { select: { name: true } } } })
        : this.prisma.customer.findMany({
            where: { OR: [{ name: { contains: s, mode: 'insensitive' } }, { email: { contains: s, mode: 'insensitive' } }] },
            take: 10,
            include: { tenant: { select: { name: true } } },
          }),
      this.prisma.paymentTransaction.findMany({
        where: { providerPaymentId: { contains: s } },
        take: 10,
        include: { intent: { select: { id: true, invoice: { select: { number: true, tenant: { select: { name: true } } } } } } },
      }),
      this.prisma.tenant.findMany({ where: { name: { contains: s, mode: 'insensitive' } }, take: 5, select: { id: true, name: true, kybStatus: true } }),
    ]);
    return {
      invoices: invoices.map((i) => ({ id: i.id, number: i.number, amount: i.amount, state: i.state, tenant: i.tenant.name, customer: i.customer.name })),
      customers: customers.map((c) => ({ id: c.id, name: c.name, phoneMasked: mask(c.phone), tenant: c.tenant.name })),
      transactions: transactions.map((t) => ({ id: t.id, intentId: t.intent.id, providerPaymentId: t.providerPaymentId, gross: t.gross, status: t.status, invoice: t.intent.invoice.number, tenant: t.intent.invoice.tenant.name })),
      tenants,
    };
  }

  // -------------------------------------------------- admin access (A-22)

  admins() {
    return this.prisma.user.findMany({
      where: { platformAdmin: true },
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async setAdmin(actor: AuthUser, email: string, isAdmin: boolean) {
    const target = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!target) {
      throw apiError(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'Ийм имэйлтэй хэрэглэгч бүртгэлгүй байна. Эхлээд бүртгүүлсэн байх шаардлагатай.', 'User not found — they must register first.');
    }
    if (!isAdmin && target.id === actor.userId) {
      throw apiError(HttpStatus.BAD_REQUEST, 'CANNOT_REVOKE_SELF', 'Өөрийнхөө админ эрхийг хасах боломжгүй.', 'You cannot revoke your own admin access.');
    }
    await this.prisma.user.update({ where: { id: target.id }, data: { platformAdmin: isAdmin } });
    await this.audit(actor, isAdmin ? 'admin.access.granted' : 'admin.access.revoked', 'user', target.id, { email: target.email });
    return this.admins();
  }
}
