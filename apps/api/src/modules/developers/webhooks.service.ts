import { Injectable, Logger } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { hmacSign } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * SSRF (OWASP A10) хамгаалалт: tenant-ийн оруулсан webhook URL дотоод сүлжээ
 * (Docker-ийн postgres/caddy, cloud metadata, loopback) руу заахыг хориглоно.
 * fetch хийхийн ӨМНӨ hostname-ийг resolve хийж хаягийг нь шалгана.
 */
function isForbiddenIp(ip: string): boolean {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    // v4-mapped (::ffff:10.0.0.1) хэлбэрийг v4 дүрмээр шалгана.
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isForbiddenIp(mapped[1]);
    return v6 === '::' || v6 === '::1' || v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd');
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

async function isBlockedUrl(raw: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return true;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return true;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return isForbiddenIp(host);
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length === 0 || addrs.some((a) => isForbiddenIp(a.address));
  } catch {
    return true; // resolve болохгүй хост руу оролдох шаардлагагүй
  }
}

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
      if (await isBlockedUrl(ep.url)) {
        this.logger.warn(`webhook ${ep.id}: blocked URL (private/invalid host), skipping`);
        await this.prisma.webhookEndpoint.update({
          where: { id: ep.id },
          data: { lastStatus: -1, lastAt: new Date() },
        });
        continue;
      }
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
            // Redirect дагахгүй — зөвшөөрөгдсөн хост дотоод хаяг руу 302-оор
            // чиглүүлж SSRF шалгалтыг тойрч гарахаас сэргийлнэ.
            redirect: 'manual',
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
