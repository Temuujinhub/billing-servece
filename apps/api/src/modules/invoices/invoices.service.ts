import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceState, Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { newPublicToken, normalizeMnPhone, payLinkFor, sha256 } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { MessagingService, renderSmsTemplate } from '../messaging/messaging.service';
import { CreateInvoiceDto, ListInvoicesDto } from './invoices.dto';

/** Legal transitions of the invoice state machine (PRD §7.1). */
const TRANSITIONS: Record<InvoiceState, InvoiceState[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'EXPIRED'],
  VIEWED: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'EXPIRED'],
  PARTIALLY_PAID: ['PAID', 'OVERDUE'],
  OVERDUE: ['VIEWED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'EXPIRED'],
  PAID: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: InvoiceState, to: InvoiceState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Нэхэмжлэхийн гарал → илгээлт аль үйлчилгээгээр тоологдох вэ.
 *  platform (өөрийн үйлчилгээний нэхэмжлэх) илгээлт төлбөргүй → null. */
export function serviceCodeOf(source: string): 'EXCEL_SMS' | 'API_SMS' | null {
  if (source === 'api') return 'API_SMS';
  if (source === 'platform') return null;
  return 'EXCEL_SMS'; // ui | import
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
  ) {}

  async list(tenantId: string, q: ListInvoicesDto) {
    const where: Prisma.InvoiceWhereInput = { tenantId };
    if (q.state) where.state = q.state;
    if (q.customerId) where.customerId = q.customerId;
    if (q.batchId) where.batchId = q.batchId;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { number: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { customer: { is: { name: { contains: s, mode: 'insensitive' } } } },
        { customer: { is: { phone: { contains: s.replace(/[\s\-]/g, '') } } } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: { customer: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(q.take ?? 50, 200),
        skip: q.skip ?? 0,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total };
  }

  async get(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        customer: true,
        batch: { select: { id: true, fileName: true, status: true } },
        shortLinks: { select: { id: true, clicks: true, createdAt: true, expiresAt: true, revokedAt: true } },
        messageJobs: { orderBy: { createdAt: 'desc' } },
        intents: {
          orderBy: { createdAt: 'desc' },
          include: {
            transactions: { include: { receipts: true } },
            events: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
    if (!invoice) {
      throw apiError(HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND', 'Нэхэмжлэх олдсонгүй.', 'Invoice not found.');
    }
    return invoice;
  }

  /**
   * Create a single invoice (optionally dispatch immediately). All writes —
   * sequence bump, customer upsert, invoice, link, SMS job, meters — commit in
   * ONE transaction so a crash can't leave a half-created invoice behind.
   */
  async create(user: AuthUser, dto: CreateInvoiceDto, source: 'ui' | 'api' | 'platform' = 'ui') {
    // Үйлчилгээний хаалт: ui/import → EXCEL_SMS, api → API_SMS идэвхтэй байх ёстой.
    if (source !== 'platform') {
      const requiredModule = source === 'api' ? 'API_SMS' : 'EXCEL_SMS';
      const module = await this.prisma.tenantModule.findUnique({
        where: { tenantId_code: { tenantId: user.tenantId, code: requiredModule } },
      });
      if (!module?.enabled) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'MODULE_DISABLED',
          source === 'api'
            ? 'API нэхэмжлэх үйлчилгээ идэвхгүй байна — Billing хуудаснаас идэвхжүүлнэ үү.'
            : 'Нэхэмжлэх илгээх үйлчилгээ идэвхгүй байна — Billing хуудаснаас идэвхжүүлнэ үү.',
          `Service module ${requiredModule} is disabled.`,
        );
      }
    }
    if (!dto.customerId && !(dto.customerName && dto.customerPhone)) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'CUSTOMER_REQUIRED',
        'Харилцагч сонгох эсвэл нэр, утасны дугаар оруулна уу.',
        'Provide customerId or customerName + customerPhone.',
      );
    }
    let phone: string | null = null;
    if (dto.customerPhone) {
      phone = normalizeMnPhone(dto.customerPhone);
      if (!phone) {
        throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_PHONE', 'Утасны дугаар буруу байна.', 'Invalid phone number.');
      }
    }
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const result = await this.prisma.$transaction(async (tx) => {
      let customerId = dto.customerId ?? null;
      if (customerId) {
        const exists = await tx.customer.findFirst({ where: { id: customerId, tenantId: user.tenantId } });
        if (!exists) {
          throw apiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', 'Харилцагч олдсонгүй.', 'Customer not found.');
        }
      } else {
        const customer = await this.customers.upsertForImport(tx, user.tenantId, {
          name: dto.customerName!.trim(),
          phone,
          email: dto.customerEmail?.trim().toLowerCase() || null,
          externalRef: null,
        });
        customerId = customer.id;
      }

      const invoice = await this.createInvoiceRow(tx, {
        tenantId: user.tenantId,
        customerId,
        amount: dto.amount,
        description: dto.description.trim(),
        dueDate,
        ebarimtEnabled: dto.ebarimt,
        source,
      });

      let payUrl: string | null = null;
      if (dto.send !== false) {
        payUrl = await this.dispatchInvoice(tx, invoice.id, user.tenantId);
      }
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorId: user.userId,
          actorEmail: user.email,
          action: dto.send !== false ? 'invoice.created_and_sent' : 'invoice.created',
          targetType: 'invoice',
          targetId: invoice.id,
          meta: { amount: dto.amount },
        },
      });
      return { invoiceId: invoice.id, payUrl };
    });

    // Submit queued SMS only after the transaction has committed.
    await this.messaging.dispatchQueued(user.tenantId);

    return this.get(user.tenantId, result.invoiceId).then((inv) => ({ ...inv, payUrl: result.payUrl }));
  }

  /** Allocate the next `PREFIX-NNNNN` number and insert the invoice row. */
  async createInvoiceRow(
    tx: Prisma.TransactionClient,
    data: {
      tenantId: string;
      customerId: string;
      amount: number;
      description: string;
      dueDate: Date | null;
      batchId?: string;
      ebarimtEnabled?: boolean;
      source?: string;
      payerRegNo?: string | null;
    },
  ) {
    // Atomic per-tenant sequence (UPDATE … RETURNING keeps concurrent creates safe).
    const seq = await tx.invoiceSequence.upsert({
      where: { tenantId: data.tenantId },
      create: { tenantId: data.tenantId, next: 2 },
      update: { next: { increment: 1 } },
    });
    const n = seq.next - 1;
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: data.tenantId }, select: { invoicePrefix: true } });
    const number = `${tenant.invoicePrefix}-${String(n).padStart(5, '0')}`;

    const invoice = await tx.invoice.create({
      data: {
        tenantId: data.tenantId,
        customerId: data.customerId,
        batchId: data.batchId,
        number,
        description: data.description,
        amount: data.amount,
        balance: data.amount,
        state: 'DRAFT',
        dueDate: data.dueDate,
        ebarimtEnabled: data.ebarimtEnabled ?? true,
        source: data.source ?? 'ui',
        payerRegNo: data.payerRegNo ?? null,
      },
    });
    await tx.usageEvent.create({
      data: {
        tenantId: data.tenantId,
        meterCode: 'INVOICE_CREATED',
        qty: 1,
        sourceEventId: `inv:${invoice.id}`,
      },
    });
    return invoice;
  }

  /**
   * DRAFT → SENT: mint a short link and send the SMS (mock provider).
   * Returns the public pay URL. Runs inside the caller's transaction.
   */
  async dispatchInvoice(tx: Prisma.TransactionClient, invoiceId: string, tenantId: string): Promise<string> {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { id: invoiceId, tenantId },
      include: { customer: true, tenant: { select: { name: true, smsTemplate: true } } },
    });
    if (!canTransition(invoice.state, 'SENT')) {
      throw apiError(
        HttpStatus.CONFLICT,
        'INVALID_STATE',
        `${invoice.state} төлөвөөс илгээх боломжгүй.`,
        `Cannot send an invoice in state ${invoice.state}.`,
      );
    }

    const token = newPublicToken();
    await tx.shortLink.create({
      data: {
        invoiceId: invoice.id,
        tokenHash: sha256(token),
        // Link outlives the due date by 30 days, minimum 60 days from now.
        expiresAt: new Date(Math.max(Date.now() + 60 * 864e5, (invoice.dueDate?.getTime() ?? 0) + 30 * 864e5)),
      },
    });
    const payUrl = payLinkFor(this.config, token);

    if (invoice.customer.phone) {
      const body = renderSmsTemplate(invoice.tenant.smsTemplate, {
        tenantName: invoice.tenant.name,
        customerName: invoice.customer.name,
        invoiceNumber: invoice.number,
        amount: invoice.amount,
        payUrl,
        dueDate: invoice.dueDate,
      });
      await this.messaging.sendSms(tx, {
        tenantId,
        invoiceId: invoice.id,
        recipient: invoice.customer.phone,
        body,
        serviceCode: serviceCodeOf(invoice.source),
      });
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { state: 'SENT', sentAt: new Date() },
    });
    return payUrl;
  }

  /** Re-send: mints a fresh link, revokes nothing (old links stay valid until expiry). */
  async send(user: AuthUser, id: string) {
    const payUrl = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!invoice) {
        throw apiError(HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND', 'Нэхэмжлэх олдсонгүй.', 'Invoice not found.');
      }
      if (invoice.state === 'DRAFT') {
        return this.dispatchInvoice(tx, id, user.tenantId);
      }
      if (['SENT', 'VIEWED', 'OVERDUE', 'PARTIALLY_PAID'].includes(invoice.state)) {
        // Reminder path: new link + SMS without a state change.
        const full = await tx.invoice.findUniqueOrThrow({
          where: { id },
          include: { customer: true, tenant: { select: { name: true, smsTemplate: true } } },
        });
        const token = newPublicToken();
        await tx.shortLink.create({
          data: { invoiceId: id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 864e5) },
        });
        const payUrl = payLinkFor(this.config, token);
        if (full.customer.phone) {
          await this.messaging.sendSms(tx, {
            tenantId: user.tenantId,
            invoiceId: id,
            recipient: full.customer.phone,
            serviceCode: serviceCodeOf(full.source),
            body: renderSmsTemplate(full.tenant.smsTemplate, {
              tenantName: full.tenant.name,
              customerName: full.customer.name,
              invoiceNumber: full.number,
              amount: full.balance,
              payUrl,
              dueDate: full.dueDate,
            }),
          });
        }
        return payUrl;
      }
      throw apiError(
        HttpStatus.CONFLICT,
        'INVALID_STATE',
        `${invoice.state} төлөвтэй нэхэмжлэхийг илгээх боломжгүй.`,
        `Cannot send an invoice in state ${invoice.state}.`,
      );
    });
    await this.messaging.dispatchQueued(user.tenantId);
    await this.prisma.auditLog.create({
      data: { tenantId: user.tenantId, actorId: user.userId, actorEmail: user.email, action: 'invoice.sent', targetType: 'invoice', targetId: id },
    });
    return { payUrl };
  }

  async cancel(user: AuthUser, id: string, reason?: string) {
    await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!invoice) {
        throw apiError(HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND', 'Нэхэмжлэх олдсонгүй.', 'Invoice not found.');
      }
      if (invoice.balance !== invoice.amount) {
        throw apiError(
          HttpStatus.CONFLICT,
          'HAS_PAYMENTS',
          'Төлөлт хийгдсэн нэхэмжлэхийг цуцлах боломжгүй. Буцаалт ашиглана уу.',
          'Invoice already has payments; use a refund instead.',
        );
      }
      if (!canTransition(invoice.state, 'CANCELLED')) {
        throw apiError(
          HttpStatus.CONFLICT,
          'INVALID_STATE',
          `${invoice.state} төлөвөөс цуцлах боломжгүй.`,
          `Cannot cancel from state ${invoice.state}.`,
        );
      }
      await tx.invoice.update({ where: { id }, data: { state: 'CANCELLED', cancelledAt: new Date() } });
      // Kill outstanding links + pending intents so the pay page refuses payment.
      await tx.shortLink.updateMany({ where: { invoiceId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.paymentIntent.updateMany({
        where: { invoiceId: id, state: { in: ['CREATED', 'PENDING', 'PROCESSING'] } },
        data: { state: 'CANCELLED' },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorId: user.userId,
          actorEmail: user.email,
          action: 'invoice.cancelled',
          targetType: 'invoice',
          targetId: id,
          meta: reason ? { reason } : undefined,
        },
      });
    });
    return this.get(user.tenantId, id);
  }

  /** Lazily flag overdue invoices (called from list/dashboard paths). */
  async markOverdue(tenantId: string) {
    await this.prisma.invoice.updateMany({
      where: {
        tenantId,
        state: { in: ['SENT', 'VIEWED'] },
        dueDate: { lt: new Date() },
      },
      data: { state: 'OVERDUE' },
    });
  }
}
