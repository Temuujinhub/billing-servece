import { Injectable, Logger } from '@nestjs/common';
import { ProviderConfigService } from './provider-config.service';
import { SmsDeliveryStatus, SmsPort, SmsSendResult } from './sms.port';

/**
 * CallPro Text API adapter (api-text.callpro.mn) — implemented against the
 * official "Text API — REST API Documentation" (Media Professional LLC, 2026)
 * and verified live against the gateway.
 *
 *   POST {base}/send                 {from, to, text, brand?} → {status, message_id}
 *   GET  {base}/message-detail/{id}  → {uniqueId, messageCount, delivered, messages[]}
 *   GET  {base}/tenant-daily-message-count?operator=  → {balance, current, total_message}
 *
 * NOTE(send-path): the PDF's heading says `/send-sms`, but that returns 404 —
 * the live action is `/send` (the doc itself refers to "/send-ээс буцсан
 * message_id" further down). The gateway strips the `/v1/sms` prefix before
 * routing, so a wrong action shows up as `{"message":"Not Found - /<action>"}`:
 * that error means the ACTION is wrong, not the base URL.
 *
 * Credentials come from the tenant's saved integration settings (env fallback).
 */
const SEND_PATH = '/send';
const DETAIL_PATH = '/message-detail';

/**
 * Turn a provider error into something an operator can act on. CallPro rejects
 * messages whose links are not pre-approved ("unverified links") — that is an
 * account/whitelisting matter, not a payload bug, so say so explicitly.
 */
function explain(status: number, raw: string): string {
  const lower = raw.toLowerCase();
  if (status === 400 && lower.includes('unverified link')) {
    return (
      'SMS дотор баталгаажаагүй линк байна. Оператор нь урьдчилан бүртгүүлээгүй ' +
      'домэйн руу заасан линкийг блоклодог — төлбөрийн линкийн домэйноо (PUBLIC_URL) ' +
      'SMS үйлчилгээ үзүүлэгчид бүртгүүлнэ үү.'
    );
  }
  if (status === 401) return 'SMS-ийн API түлхүүр буруу эсвэл дутуу байна.';
  if (status === 402) return 'SMS-ийн үлдэгдэл/төлбөр төлөгдөөгүй байна.';
  if (status === 403) return 'Хүлээн авагчийн дугаар хаагдсан байна.';
  if (status === 422) return `SMS-ийн параметр буруу: ${raw.slice(0, 160)}`;
  return `SMS илгээгч алдаа буцаалаа (${status}): ${raw.slice(0, 200)}`;
}

@Injectable()
export class CallProSmsAdapter implements SmsPort {
  readonly code = 'callpro';
  private readonly logger = new Logger(CallProSmsAdapter.name);

  constructor(private readonly providerConfigs: ProviderConfigService) {}

  async send(args: { tenantId: string; to: string; text: string }): Promise<SmsSendResult> {
    const cfg = await this.providerConfigs.getCallpro(args.tenantId);
    if (!cfg.apiKey || !cfg.from) {
      throw new Error('CallPro SMS is not configured for this tenant');
    }
    // CallPro accepts 8-digit local numbers; strip the +976 prefix we normalize to.
    const to = args.to.replace(/^\+?976/, '');

    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}${SEND_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
      body: JSON.stringify({ from: cfg.from, to, text: args.text }),
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await res.text();
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      /* non-JSON */
    }
    if (!res.ok) {
      throw new Error(explain(res.status, body?.error ?? body?.message ?? raw));
    }
    this.logger.log(`[callpro] queued message ${body?.message_id ?? '?'} → ${to}`);
    return { providerRef: String(body?.message_id ?? ''), delivered: false };
  }

  /** GET /message-detail/{message_id} — QUEUED → DELIVERED / UNDELIVERED. */
  async getStatus(tenantId: string, providerRef: string): Promise<SmsDeliveryStatus> {
    const cfg = await this.providerConfigs.getCallpro(tenantId);
    if (!cfg.apiKey || !providerRef) return { state: 'UNKNOWN' };

    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}${DETAIL_PATH}/${encodeURIComponent(providerRef)}`, {
      headers: { 'x-api-key': cfg.apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { state: 'UNKNOWN' };
    const body: any = await res.json().catch(() => ({}));

    const segments = Number(body?.messageCount) || undefined;
    if (body?.delivered === true) return { state: 'DELIVERED', segments };

    // Fall back to the newest event across all message parts.
    const events: string[] = Array.isArray(body?.messages)
      ? body.messages.flatMap((m: any) => (Array.isArray(m?.events) ? m.events.map((e: any) => String(e?.type ?? e?.event ?? e)) : []))
      : [];
    if (events.some((e) => e.toUpperCase().includes('UNDELIVERED'))) return { state: 'UNDELIVERED', segments };
    if (events.some((e) => e.toUpperCase().includes('DELIVERED'))) return { state: 'DELIVERED', segments };
    if (events.length > 0) return { state: 'QUEUED', segments };
    return { state: 'UNKNOWN', segments };
  }

  /**
   * GET /tenant-daily-message-count?operator= — remaining quota per operator.
   * Used by the admin provider-health view; never throws on transport errors.
   */
  async balance(tenantId: string, operator: 'skytel' | 'mobicom' | 'unitel' = 'unitel') {
    const cfg = await this.providerConfigs.getCallpro(tenantId);
    if (!cfg.apiKey) return null;
    try {
      const res = await fetch(
        `${cfg.baseUrl.replace(/\/$/, '')}/tenant-daily-message-count?operator=${operator}`,
        { headers: { 'x-api-key': cfg.apiKey }, signal: AbortSignal.timeout(15_000) },
      );
      if (!res.ok) return null;
      const body: any = await res.json().catch(() => ({}));
      return {
        operator,
        balance: Number(body?.balance) || 0,
        current: Number(body?.current) || 0,
        total: Number(body?.total_message) || 0,
      };
    } catch {
      return null;
    }
  }
}
