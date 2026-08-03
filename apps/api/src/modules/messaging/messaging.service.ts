import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { formatMnt, smsSegments } from '../../common/utils';

/**
 * SMS dispatch port. The MVP ships a MOCK adapter: jobs are recorded with
 * real segment accounting (that drives billing meters) and marked DELIVERED,
 * but nothing leaves the platform. Swap `submitToProvider` with a real
 * Mongolian SMS provider (Unitel/Mobicom/Skytel gateway) once contracts and
 * sender-ID registration are in place — the call sites do not change.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  buildInvoiceSms(opts: { tenantName: string; amount: number; payUrl: string; dueDate?: Date | null }): string {
    const due = opts.dueDate ? `, хугацаа: ${opts.dueDate.toISOString().slice(0, 10)}` : '';
    return `${opts.tenantName}: Танд ${formatMnt(opts.amount)} нэхэмжлэх ирлээ${due}. Төлөх: ${opts.payUrl}`;
  }

  /**
   * Queue + "send" an SMS inside the caller's transaction, and meter the
   * segments (SMS_SEGMENT_SENT drives the 25₮/segment line on the bill).
   */
  async sendSms(
    tx: Prisma.TransactionClient,
    opts: { tenantId: string; invoiceId?: string; recipient: string; body: string },
  ) {
    const segments = smsSegments(opts.body);
    const job = await tx.messageJob.create({
      data: {
        tenantId: opts.tenantId,
        invoiceId: opts.invoiceId,
        channel: 'sms',
        recipient: opts.recipient,
        body: opts.body,
        segments,
        status: 'DELIVERED', // mock provider: accepted == delivered
        providerRef: `MOCK-${randomUUID().slice(0, 8)}`,
      },
    });
    await tx.usageEvent.create({
      data: {
        tenantId: opts.tenantId,
        meterCode: 'SMS_SEGMENT_SENT',
        qty: segments,
        sourceEventId: `sms:${job.id}`,
      },
    });
    this.logger.log(`[mock-sms] ${opts.recipient} ← ${segments} segment(s)`);
    return job;
  }
}
