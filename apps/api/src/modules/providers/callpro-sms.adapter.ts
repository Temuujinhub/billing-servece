import { Injectable, Logger } from '@nestjs/common';
import { ProviderConfigService } from './provider-config.service';
import { SmsPort, SmsSendResult } from './sms.port';

/**
 * CallPro Text API adapter (api-text.callpro.mn).
 *
 * Auth: x-api-key header. Verified live against the gateway:
 *   POST {baseUrl}/send  {from, to, text} → 200 {status:"queued", message_id}
 * NOTE: the gateway strips the `/v1/sms` prefix before routing, so a wrong
 * action name surfaces as `{"message":"Not Found - /<action>"}` — that error
 * means the ACTION is wrong, not the base URL. API docs: {baseUrl}/docs.
 *
 * Credentials come from the tenant's saved integration settings (env fallback).
 */
const SEND_PATH = '/send';
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
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`CallPro send failed (${res.status}): ${body?.error ?? JSON.stringify(body).slice(0, 200)}`);
    }
    this.logger.log(`[callpro] queued message ${body?.message_id ?? '?'} → ${to}`);
    return { providerRef: String(body?.message_id ?? ''), delivered: false };
  }
}
