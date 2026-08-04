import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhooksService } from '../developers/webhooks.service';
import { QpayAdapter } from '../providers/qpay.adapter';

/**
 * eBarimt receipts. Mock provider in MVP: receipts are generated locally with
 * realistic fields, following the real state machine
 * (PENDING → CREATED → DELIVERED, FAILED + retry). The real QPay eBarimt 3.0 /
 * ITC POS API 3.0 integration replaces `callProvider` only.
 *
 * Design rule (PRD §5.7): a payment is never blocked or rolled back because
 * the tax provider is down — the receipt waits in PENDING and is retried.
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qpay: QpayAdapter,
    private readonly webhooks: WebhooksService,
  ) {}

  /** Called inside the payment-confirm transaction. */
  async createForTransaction(
    tx: Prisma.TransactionClient,
    args: { tenantId: string; transactionId: string; invoiceOptIn?: boolean },
  ) {
    const module = await tx.tenantModule.findUnique({
      where: { tenantId_code: { tenantId: args.tenantId, code: 'EBARIMT' } },
    });
    // Both the tenant module AND the per-invoice checkbox must allow it.
    const wanted = Boolean(module?.enabled) && args.invoiceOptIn !== false;
    await tx.ebarimtReceipt.create({
      data: {
        tenantId: args.tenantId,
        transactionId: args.transactionId,
        state: wanted ? 'PENDING' : 'NOT_REQUIRED',
      },
    });
  }

  /** Drain PENDING receipts for a tenant (invoked after payments + retry endpoint). */
  async processPending(tenantId: string) {
    const pending = await this.prisma.ebarimtReceipt.findMany({
      where: { tenantId, state: { in: ['PENDING', 'FAILED'] }, retries: { lt: 5 } },
      take: 20,
      include: { transaction: { select: { provider: true, providerPaymentId: true } } },
    });
    let processed = 0;
    for (const receipt of pending) {
      try {
        const result = await this.callProvider(tenantId, receipt.transaction.provider, receipt.transaction.providerPaymentId);
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.ebarimtReceipt.updateMany({
            where: { id: receipt.id, state: { in: ['PENDING', 'FAILED'] } },
            data: {
              state: 'CREATED',
              receiptNo: result.receiptNo,
              lottery: result.lottery,
              qrData: result.qrData,
              error: null,
            },
          });
          if (claimed.count > 0) {
            await tx.usageEvent.create({
              data: {
                tenantId,
                meterCode: 'RECEIPT_CREATED',
                qty: 1,
                sourceEventId: `rcpt:${receipt.id}`,
              },
            });
            processed += 1;
          }
        });
        this.webhooks.emit(tenantId, 'receipt.created', {
          receipt_id: receipt.id,
          transaction_id: receipt.transactionId,
          receipt_no: result.receiptNo,
          lottery: result.lottery,
        });
      } catch (e: any) {
        await this.prisma.ebarimtReceipt.update({
          where: { id: receipt.id },
          data: { state: 'FAILED', retries: { increment: 1 }, error: String(e?.message ?? e).slice(0, 500) },
        });
        this.logger.warn(`eBarimt create failed for ${receipt.id}: ${e?.message}`);
      }
    }
    return { processed };
  }

  async list(tenantId: string, take = 50, skip = 0) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ebarimtReceipt.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(take, 200),
        skip,
        include: {
          transaction: {
            select: {
              gross: true,
              paidAt: true,
              intent: { select: { invoice: { select: { id: true, number: true, customer: { select: { name: true } } } } } },
            },
          },
        },
      }),
      this.prisma.ebarimtReceipt.count({ where: { tenantId } }),
    ]);
    return { items, total };
  }

  async retry(tenantId: string, receiptId: string) {
    await this.prisma.ebarimtReceipt.updateMany({
      where: { id: receiptId, tenantId, state: 'FAILED' },
      data: { state: 'PENDING' },
    });
    return this.processPending(tenantId);
  }

  /**
   * Real payments (provider=qpay) create the receipt through QPay's eBarimt
   * integration; mock payments keep generating realistic local receipts.
   */
  private async callProvider(
    tenantId: string,
    paymentProvider: string,
    providerPaymentId: string,
  ): Promise<{ receiptNo: string; lottery: string | null; qrData: string | null }> {
    if (paymentProvider === 'qpay') {
      const result = await this.qpay.createEbarimt(tenantId, providerPaymentId, 'CITIZEN');
      return { receiptNo: result.receiptNo, lottery: result.lottery, qrData: result.qrData };
    }
    const lottery = `${this.block(2)} ${this.block(2)} ${this.block(6)}`;
    return {
      receiptNo: randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase(),
      lottery,
      qrData: randomBytes(48).toString('base64'),
    };
  }

  private block(n: number): string {
    const chars = '0123456789';
    return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
}
