import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newPublicToken, sha256 } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService, renderSmsTemplate } from './messaging.service';

const SWEEP_MS = 60 * 60 * 1000; // hourly sweep
const MAX_REMINDERS = 3; // PRD §5.4 max attempts
const GAP_MS = 72 * 3600 * 1000; // ≥72h between reminders

/**
 * Overdue-invoice reminder automation (PRD §5.4, dunning-lite).
 * Runs in-process on an hourly sweep — only inside quiet-hour-safe daytime
 * (10:00–20:00 Улаанбаатар), only for tenants that enabled the REMINDER
 * module, capped at 3 attempts ≥72h apart. Single-instance safe via the
 * atomic remindersSent guard on each invoice row.
 */
@Injectable()
export class ReminderService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReminderService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.error(e?.message)), SWEEP_MS);
    // First pass shortly after boot so a restart never loses a day.
    setTimeout(() => void this.sweep().catch((e) => this.logger.error(e?.message)), 30_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private inDaytimeUB(): boolean {
    const hourUB = (new Date().getUTCHours() + 8) % 24; // Asia/Ulaanbaatar = UTC+8
    return hourUB >= 10 && hourUB < 20;
  }

  async sweep() {
    if (!this.inDaytimeUB()) return;

    const tenants = await this.prisma.tenantModule.findMany({
      where: { code: 'REMINDER', enabled: true },
      select: { tenantId: true },
    });
    for (const { tenantId } of tenants) {
      const candidates = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          state: { in: ['SENT', 'VIEWED', 'OVERDUE'] },
          dueDate: { lt: new Date() },
          remindersSent: { lt: MAX_REMINDERS },
          OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: new Date(Date.now() - GAP_MS) } }],
        },
        include: { customer: true, tenant: { select: { name: true, smsTemplate: true } } },
        take: 100,
      });
      let sent = 0;
      for (const invoice of candidates) {
        if (!invoice.customer.phone) continue;
        try {
          await this.prisma.$transaction(async (tx) => {
            // Atomic claim — a concurrent sweep can't double-remind.
            const claimed = await tx.invoice.updateMany({
              where: {
                id: invoice.id,
                remindersSent: invoice.remindersSent,
              },
              data: { remindersSent: { increment: 1 }, lastReminderAt: new Date(), state: 'OVERDUE' },
            });
            if (claimed.count === 0) return;

            const token = newPublicToken();
            await tx.shortLink.create({
              data: { invoiceId: invoice.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 864e5) },
            });
            const payUrl = `${this.config.get('PUBLIC_URL') ?? ''}/p/${token}`;
            const body = `Сануулга (${invoice.remindersSent + 1}/${MAX_REMINDERS}): ${renderSmsTemplate(invoice.tenant.smsTemplate, {
              tenantName: invoice.tenant.name,
              customerName: invoice.customer.name,
              invoiceNumber: invoice.number,
              amount: invoice.balance,
              payUrl,
              dueDate: invoice.dueDate,
            })}`;
            await this.messaging.sendSms(tx, {
              tenantId,
              invoiceId: invoice.id,
              recipient: invoice.customer.phone!,
              body: body.slice(0, 480),
            });
            sent += 1;
          });
        } catch (e: any) {
          this.logger.warn(`Reminder failed for invoice ${invoice.id}: ${e?.message}`);
        }
      }
      if (sent > 0) {
        await this.messaging.dispatchQueued(tenantId);
        this.logger.log(`Reminders sent for tenant ${tenantId}: ${sent}`);
      }
    }
  }
}
