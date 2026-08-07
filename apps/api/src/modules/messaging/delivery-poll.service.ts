import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from './messaging.service';

/** SMS delivery receipts land within a minute or two — poll a bit after that. */
const POLL_MS = 5 * 60 * 1000;
/** Stop chasing a message that never resolved; the provider drops old ids. */
const MAX_AGE_MS = 24 * 3600 * 1000;

/**
 * Delivery-receipt poller. CallPro confirms delivery asynchronously
 * (QUEUED → DELIVERED / UNDELIVERED via /message-detail), so without this a
 * job would sit at SUBMITTED forever and the merchant could never tell whether
 * the payer actually received the payment link.
 *
 * Runs in-process every 5 minutes over tenants that have recent SUBMITTED
 * jobs. Never throws — a provider outage just leaves the job pending.
 */
@Injectable()
export class DeliveryPollService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryPollService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.error(e?.message)), POLL_MS);
    setTimeout(() => void this.sweep().catch((e) => this.logger.error(e?.message)), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep() {
    const since = new Date(Date.now() - MAX_AGE_MS);
    const tenants = await this.prisma.messageJob.groupBy({
      by: ['tenantId'],
      where: { status: 'SUBMITTED', providerRef: { not: null }, createdAt: { gt: since } },
    });
    for (const { tenantId } of tenants) {
      const res = await this.messaging.refreshDeliveryStatus(tenantId).catch(() => null);
      if (res && (res.delivered || res.undelivered)) {
        this.logger.log(`SMS delivery: ${res.delivered} delivered, ${res.undelivered} undelivered, ${res.pending} pending (tenant ${tenantId})`);
      }
    }
  }
}
