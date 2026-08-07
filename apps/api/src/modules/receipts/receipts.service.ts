import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhooksService } from '../developers/webhooks.service';
import { EBARIMT_PORT, EbarimtPort } from '../providers/ebarimt.port';
import { PosApiEbarimtAdapter } from '../providers/posapi-ebarimt.adapter';

/**
 * eBarimt receipts. The actual receipt is cut by the EBARIMT_PORT adapter
 * (EBARIMT_PROVIDER=mock|qpay|posapi); this service owns the state machine
 * (PENDING → CREATED → DELIVERED, FAILED + retry) and usage metering.
 *
 * posapi = ТЕГ POS API 3.0 local instance (LIME-ээр суулгасан) — see
 * providers/posapi-ebarimt.adapter.ts. Tenants carry their OWN ТЕГ POS
 * registration (ebarimtMerchantTin/ebarimtPosNo/…) which overrides env
 * defaults per receipt.
 *
 * Design rule (PRD §5.7): a payment is never blocked or rolled back because
 * the tax provider is down — the receipt waits in PENDING and is retried.
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EBARIMT_PORT) private readonly ebarimt: EbarimtPort,
    private readonly posapi: PosApiEbarimtAdapter,
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
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        tin: true,
        ebarimtMerchantTin: true,
        ebarimtPosNo: true,
        ebarimtBranchNo: true,
        ebarimtDistrictCode: true,
        ebarimtVatPayer: true,
        ebarimtVatFreeProj: true,
      },
    });
    const pending = await this.prisma.ebarimtReceipt.findMany({
      where: { tenantId, state: { in: ['PENDING', 'FAILED'] }, retries: { lt: 5 } },
      take: 20,
      include: {
        transaction: {
          select: {
            provider: true,
            providerPaymentId: true,
            gross: true,
            intent: { select: { invoice: { select: { number: true, description: true } } } },
          },
        },
      },
    });
    let processed = 0;
    for (const receipt of pending) {
      try {
        const invoice = receipt.transaction.intent.invoice;
        const result = await this.ebarimt.createReceipt({
          tenantId,
          amount: receipt.transaction.gross,
          description: `${invoice.number} ${invoice.description}`.slice(0, 128),
          receiptType: receipt.receiptType === 'ORGANIZATION' ? 'ORGANIZATION' : 'CITIZEN',
          customerTin: receipt.payerRegNo,
          paymentProvider: receipt.transaction.provider,
          providerPaymentId: receipt.transaction.providerPaymentId,
          merchant: {
            // merchantTin = ТТД. Тусад нь бөглөөгүй бол байгууллагын ТТД-г авна.
            merchantTin: tenant.ebarimtMerchantTin || tenant.tin,
            posNo: tenant.ebarimtPosNo,
            branchNo: tenant.ebarimtBranchNo,
            districtCode: tenant.ebarimtDistrictCode,
            vatPayer: tenant.ebarimtVatPayer,
            vatFreeProject: tenant.ebarimtVatFreeProj,
          },
        });
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
   * Active eBarimt provider + (posapi only) the local instance's /rest/info —
   * бүртгэл зөв эсэхийг холболт хийхийн ӨМНӨ эндээс шалгана (заавар §3).
   */
  async providerInfo() {
    if (this.ebarimt.code !== this.posapi.code) {
      return { provider: this.ebarimt.code };
    }
    try {
      return { provider: this.ebarimt.code, info: await this.posapi.info() };
    } catch (e: any) {
      return { provider: this.ebarimt.code, error: String(e?.message ?? e) };
    }
  }
}
