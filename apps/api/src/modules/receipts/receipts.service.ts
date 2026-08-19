import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/filters/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhooksService } from '../developers/webhooks.service';
import { EBARIMT_PORT, EbarimtPort } from '../providers/ebarimt.port';
import { PosApiEbarimtAdapter } from '../providers/posapi-ebarimt.adapter';
import { ReceiptPurgeService } from './receipt-purge.service';

/** Date → "yyyy-MM-dd HH:mm:ss" (Улаанбаатар, UTC+8) — POS API-ийн огнооны формат. */
function formatUbDateTime(d: Date): string {
  return new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
}

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
    private readonly purge: ReceiptPurgeService,
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

  /**
   * Standalone баримт (Үйлчилгээ 3: API / Үйлчилгээ 4: POS) — нэхэмжлэх,
   * төлбөрийн гинжгүйгээр шууд үүсгэнэ. PENDING бичээд синхроноор нэг удаа
   * оролдоно; амжилтгүй бол sweeper дараа нь дахин оролдоно.
   */
  async createStandalone(args: {
    tenantId: string;
    source: 'api' | 'pos' | 'test';
    amount: number;
    description?: string | null;
    receiptType?: 'CITIZEN' | 'ORGANIZATION';
    payerRegNo?: string | null;
    deviceId?: string | null;
    paymentMethod?: 'CASH' | 'CARD' | 'BANK_TRANSFER';
  }) {
    const receipt = await this.prisma.ebarimtReceipt.create({
      data: {
        tenantId: args.tenantId,
        source: args.source,
        amount: args.amount,
        description: args.description?.slice(0, 128) ?? null,
        deviceId: args.deviceId ?? null,
        receiptType: args.receiptType === 'ORGANIZATION' ? 'ORGANIZATION' : 'CITIZEN',
        payerRegNo: args.payerRegNo ?? null,
        state: 'PENDING',
        // paymentMethod-ыг error талбарт биш тусдаа хадгалахгүй — provider
        // дуудлагад л хэрэгтэй тул description-ий хамт доор дамжуулна.
      },
    });
    await this.processOne(receipt.id, args.paymentMethod);
    return this.prisma.ebarimtReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
  }

  /** Нэг баримтыг provider руу илгээх (payment + standalone хоёуланд). */
  private async processOne(receiptId: string, paymentMethod?: 'CASH' | 'CARD' | 'BANK_TRANSFER') {
    const receipt = await this.prisma.ebarimtReceipt.findUnique({
      where: { id: receiptId },
      include: {
        transaction: {
          select: {
            provider: true,
            providerPaymentId: true,
            gross: true,
            intent: { select: { invoice: { select: { number: true, description: true, payerRegNo: true } } } },
          },
        },
      },
    });
    if (!receipt || !['PENDING', 'FAILED'].includes(receipt.state) || receipt.retries >= 5) return false;
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: receipt.tenantId },
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
    const keepQr = this.purge.retentionHours > 0;
    const tenantId = receipt.tenantId;
    try {
      const invoice = receipt.transaction?.intent.invoice;
      // Нэхэмжлэх дээр төлөгч байгууллагын регистр байвал B2B баримт гаргана.
      const payerRegNo = receipt.payerRegNo || invoice?.payerRegNo || null;
      const receiptType = receipt.receiptType === 'ORGANIZATION' || (invoice?.payerRegNo && receipt.source === 'payment')
        ? 'ORGANIZATION'
        : 'CITIZEN';
      const result = await this.ebarimt.createReceipt({
        tenantId,
        amount: receipt.transaction?.gross ?? receipt.amount ?? 0,
        description: (invoice ? `${invoice.number} ${invoice.description}` : (receipt.description ?? 'Борлуулалт')).slice(0, 128),
        receiptType,
        customerTin: payerRegNo,
        paymentProvider: receipt.transaction?.provider ?? (paymentMethod === 'CASH' ? 'cash' : paymentMethod === 'BANK_TRANSFER' ? 'bank_transfer' : 'card'),
        providerPaymentId: receipt.transaction?.providerPaymentId ?? receipt.id,
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
      let claimedNow = false;
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.ebarimtReceipt.updateMany({
          where: { id: receipt.id, state: { in: ['PENDING', 'FAILED'] } },
          data: {
            state: 'CREATED',
            receiptNo: result.receiptNo,
            receiptDate: result.receiptDate ?? null,
            receiptType,
            payerRegNo,
            // Хадгалах хугацаа 0 бол сугалаа/QR-г огт бичихгүй (ТЕГ-ийн
            // заавар: баримтанд хэвлэхээс өөрөөр хадгалахыг хориглоно).
            lottery: keepQr ? result.lottery : null,
            qrData: keepQr ? result.qrData : null,
            error: null,
          },
        });
        if (claimed.count > 0) {
          claimedNow = true;
          await tx.usageEvent.create({
            data: {
              tenantId,
              meterCode: 'RECEIPT_CREATED',
              qty: 1,
              serviceCode: receipt.source === 'api' ? 'EBARIMT_API' : receipt.source === 'pos' ? 'POS_EBARIMT' : null,
              sourceEventId: `rcpt:${receipt.id}`,
            },
          });
        }
      });
      if (claimedNow) {
        this.webhooks.emit(tenantId, 'receipt.created', {
          receipt_id: receipt.id,
          transaction_id: receipt.transactionId,
          receipt_no: result.receiptNo,
          lottery: result.lottery,
        });
      }
      return claimedNow;
    } catch (e: any) {
      await this.prisma.ebarimtReceipt.update({
        where: { id: receipt.id },
        data: { state: 'FAILED', retries: { increment: 1 }, error: String(e?.message ?? e).slice(0, 500) },
      });
      this.logger.warn(`eBarimt create failed for ${receipt.id}: ${e?.message}`);
      return false;
    }
  }

  /**
   * Баримт цуцлах (B-22) — хүсэлтийг хүлээн авч ТЕГ POS API руу дамжуулна.
   *   PENDING/FAILED  → ТЕГ-т очоогүй тул шууд CANCELLED (юу ч дамжуулахгүй)
   *   CREATED/DELIVERED → CANCEL_PENDING болгож adapter-ын DELETE-ийг дуудна;
   *                       амжилтгүй бол CANCEL_PENDING-д үлдэж sweeper дахина
   *   CANCELLED       → идемпотент, хэвээр буцаана
   */
  async cancel(tenantId: string, receiptId: string, actor?: { userId?: string; email?: string }) {
    const receipt = await this.prisma.ebarimtReceipt.findFirst({ where: { id: receiptId, tenantId } });
    if (!receipt) {
      throw apiError(HttpStatus.NOT_FOUND, 'RECEIPT_NOT_FOUND', 'Баримт олдсонгүй.', 'Receipt not found.');
    }
    if (receipt.state === 'CANCELLED') return receipt;
    if (receipt.state === 'NOT_REQUIRED') {
      throw apiError(HttpStatus.BAD_REQUEST, 'RECEIPT_NOT_CANCELLABLE', 'Энэ бичилтэд баримт үүсээгүй тул цуцлах зүйл алга.', 'Nothing to cancel.');
    }

    // ТЕГ-т хараахан очоогүй баримт: дотооддоо цуцалж, дахин илгээхийг зогсооно.
    if (receipt.state === 'PENDING' || receipt.state === 'FAILED') {
      const updated = await this.prisma.ebarimtReceipt.update({
        where: { id: receipt.id },
        data: { state: 'CANCELLED', error: null },
      });
      await this.auditCancel(tenantId, receipt.id, actor, 'local');
      return updated;
    }

    // CREATED | DELIVERED | CANCEL_PENDING → ТЕГ рүү дамжуулна.
    if (!receipt.receiptNo) {
      throw apiError(HttpStatus.BAD_REQUEST, 'RECEIPT_NOT_CANCELLABLE', 'Баримтын ДДТД олдсонгүй — цуцлах боломжгүй.', 'Receipt has no id (ДДТД).');
    }
    await this.prisma.ebarimtReceipt.updateMany({
      where: { id: receipt.id, state: { in: ['CREATED', 'DELIVERED'] } },
      data: { state: 'CANCEL_PENDING' },
    });
    try {
      if (!this.ebarimt.cancelReceipt) {
        throw new Error(`${this.ebarimt.code} adapter цуцлалт дэмждэггүй`);
      }
      await this.ebarimt.cancelReceipt({
        tenantId,
        receiptNo: receipt.receiptNo,
        // POS API-ийн өгсөн огноог тэргүүлж, хуучин (өмнөх хувилбарын) баримтад
        // үүссэн цагаа УБ-ын цагаар форматлана.
        receiptDate: receipt.receiptDate ?? formatUbDateTime(receipt.createdAt),
      });
      const updated = await this.prisma.ebarimtReceipt.update({
        where: { id: receipt.id },
        data: { state: 'CANCELLED', error: null },
      });
      await this.auditCancel(tenantId, receipt.id, actor, 'provider');
      this.webhooks.emit(tenantId, 'receipt.cancelled', {
        receipt_id: receipt.id,
        receipt_no: receipt.receiptNo,
      });
      return updated;
    } catch (e: any) {
      const message = String(e?.message ?? e).slice(0, 500);
      const updated = await this.prisma.ebarimtReceipt.update({
        where: { id: receipt.id },
        data: { state: 'CANCEL_PENDING', error: message },
      });
      this.logger.warn(`eBarimt cancel failed for ${receipt.id}: ${message}`);
      return updated;
    }
  }

  private auditCancel(tenantId: string, receiptId: string, actor: { userId?: string; email?: string } | undefined, via: 'local' | 'provider') {
    return this.prisma.auditLog
      .create({
        data: {
          tenantId,
          actorId: actor?.userId,
          actorEmail: actor?.email ?? 'system',
          action: 'receipt.cancelled',
          targetType: 'receipt',
          targetId: receiptId,
          meta: { via },
        },
      })
      .catch(() => undefined);
  }

  /** CANCEL_PENDING баримтуудыг дахин цуцлах гэж оролдоно (sweeper). */
  async processCancelPending(tenantId: string) {
    const rows = await this.prisma.ebarimtReceipt.findMany({
      where: { tenantId, state: 'CANCEL_PENDING' },
      select: { id: true },
      take: 50,
    });
    for (const r of rows) {
      await this.cancel(tenantId, r.id).catch(() => undefined);
    }
    return rows.length;
  }

  /** Drain PENDING receipts for a tenant (invoked after payments + retry endpoint). */
  async processPending(tenantId: string) {
    const pending = await this.prisma.ebarimtReceipt.findMany({
      where: { tenantId, state: { in: ['PENDING', 'FAILED'] }, retries: { lt: 5 } },
      take: 20,
      select: { id: true },
    });
    let processed = 0;
    for (const receipt of pending) {
      if (await this.processOne(receipt.id)) processed += 1;
    }
    return { processed };
  }

  /** Бүх tenant-ийн гацсан баримтыг дахин оролдох sweeper-т зориулсан жагсаалт. */
  async tenantsWithPending(): Promise<string[]> {
    const rows = await this.prisma.ebarimtReceipt.findMany({
      where: { state: { in: ['PENDING', 'FAILED', 'CANCEL_PENDING'] }, retries: { lt: 5 } },
      select: { tenantId: true },
      distinct: ['tenantId'],
      take: 100,
    });
    return rows.map((r) => r.tenantId);
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
