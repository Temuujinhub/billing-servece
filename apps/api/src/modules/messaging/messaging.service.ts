import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMnt, smsSegments, transliterateMn } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderResolver } from '../providers/provider-resolver.service';

export const DEFAULT_SMS_TEMPLATE =
  '{{байгууллага}}: Танд {{дүн}} нэхэмжлэх ирлээ{{хугацаа}}. Төлөх: {{линк}}';

export interface SmsTemplateContext {
  tenantName: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  payUrl: string;
  dueDate?: Date | null;
}

/**
 * Renders the tenant's custom SMS template (Settings → Мессежийн загвар).
 * Supported variables: {{байгууллага}} {{нэр}} {{дугаар}} {{дүн}} {{хугацаа}} {{линк}}.
 * {{линк}} is mandatory — enforced at save time; appended defensively here too.
 */
export function renderSmsTemplate(template: string | null | undefined, ctx: SmsTemplateContext): string {
  const tpl = template?.trim() || DEFAULT_SMS_TEMPLATE;
  const due = ctx.dueDate ? `, хугацаа: ${ctx.dueDate.toISOString().slice(0, 10)}` : '';
  let out = tpl
    .replaceAll('{{байгууллага}}', ctx.tenantName)
    .replaceAll('{{нэр}}', ctx.customerName)
    .replaceAll('{{дугаар}}', ctx.invoiceNumber)
    .replaceAll('{{дүн}}', formatMnt(ctx.amount))
    .replaceAll('{{хугацаа}}', due)
    .replaceAll('{{линк}}', ctx.payUrl);
  if (!out.includes(ctx.payUrl)) out = `${out} ${ctx.payUrl}`;
  return out.slice(0, 480); // hard cap ≈ 7 UCS-2 segments
}

/**
 * SMS dispatch. Jobs are QUEUED inside the caller's DB transaction (so the
 * invoice + message + usage meter commit atomically), then submitted to the
 * provider AFTER commit via `dispatchQueued` — an external HTTP call never
 * holds a DB transaction open, and a provider outage never rolls back
 * invoices. Failed submissions stay visible as FAILED and can be re-driven.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ProviderResolver,
  ) {}

  /**
   * Queue an SMS inside the caller's transaction and meter the segments
   * (SMS_SEGMENT_SENT drives the 25₮/segment line on the bill).
   */
  async sendSms(
    tx: Prisma.TransactionClient,
    opts: { tenantId: string; invoiceId?: string; recipient: string; body: string },
  ) {
    // Tenant opt-in: transliterate to Latin so the SMS packs GSM-7 segments
    // (160/153 chars) instead of UCS-2 (70/67) — roughly half the cost.
    const tenant = await tx.tenant.findUnique({
      where: { id: opts.tenantId },
      select: { smsTransliterate: true },
    });
    const body = tenant?.smsTransliterate ? transliterateMn(opts.body) : opts.body;
    const segments = smsSegments(body);
    const job = await tx.messageJob.create({
      data: {
        tenantId: opts.tenantId,
        invoiceId: opts.invoiceId,
        channel: 'sms',
        recipient: opts.recipient,
        body,
        segments,
        status: 'QUEUED',
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
    return job;
  }

  /**
   * Submit QUEUED jobs to the provider. Call AFTER the enclosing transaction
   * has committed. Never throws — submission failures are recorded per-job.
   */
  async dispatchQueued(tenantId: string): Promise<{ submitted: number; failed: number }> {
    const sms = await this.resolver.getSmsPort(tenantId);
    const jobs = await this.prisma.messageJob.findMany({
      where: { tenantId, status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    let submitted = 0;
    let failed = 0;
    for (const job of jobs) {
      // Claim so concurrent dispatchers never double-send one job.
      const claimed = await this.prisma.messageJob.updateMany({
        where: { id: job.id, status: 'QUEUED' },
        data: { status: 'SUBMITTED' },
      });
      if (claimed.count === 0) continue;
      try {
        const result = await sms.send({ tenantId, to: job.recipient, text: job.body });
        await this.prisma.messageJob.update({
          where: { id: job.id },
          data: {
            status: result.delivered ? 'DELIVERED' : 'SUBMITTED',
            providerRef: result.providerRef,
            error: null,
          },
        });
        submitted += 1;
      } catch (e: any) {
        failed += 1;
        await this.prisma.messageJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', error: String(e?.message ?? e).slice(0, 500) },
        });
        this.logger.warn(`SMS submit failed for job ${job.id}: ${e?.message}`);
      }
    }
    if (jobs.length > 0) {
      this.logger.log(`SMS dispatch: ${submitted} submitted, ${failed} failed (provider=${sms.code})`);
    }
    return { submitted, failed };
  }
}
