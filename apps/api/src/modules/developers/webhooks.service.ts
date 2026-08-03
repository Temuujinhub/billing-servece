import { Injectable, Logger } from '@nestjs/common';
import { hmacSign } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Merchant outbound webhooks (PRD §9.3). At-least-once, HMAC-SHA256 signed
 * (`X-Billing-Signature`), one immediate retry; the endpoint's last status is
 * recorded for the Developers page. Fire-and-forget — never blocks payments.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  emit(tenantId: string, event: string, payload: Record<string, unknown>) {
    // Deliberately not awaited by business flows.
    void this.deliver(tenantId, event, payload).catch((e) => {
      this.logger.warn(`webhook emit failed: ${e?.message}`);
    });
  }

  private async deliver(tenantId: string, event: string, payload: Record<string, unknown>) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId, active: true },
    });
    const body = JSON.stringify({ event, created_at: new Date().toISOString(), data: payload });
    for (const ep of endpoints) {
      const events = Array.isArray(ep.events) ? (ep.events as string[]) : [];
      if (events.length > 0 && !events.includes(event)) continue;
      let status: number | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(ep.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Billing-Event': event,
              'X-Billing-Signature': hmacSign(ep.secret, body),
            },
            body,
            signal: AbortSignal.timeout(10_000),
          });
          status = res.status;
          if (res.ok) break;
        } catch {
          status = 0; // network failure
        }
      }
      await this.prisma.webhookEndpoint.update({
        where: { id: ep.id },
        data: { lastStatus: status, lastAt: new Date() },
      });
    }
  }
}
