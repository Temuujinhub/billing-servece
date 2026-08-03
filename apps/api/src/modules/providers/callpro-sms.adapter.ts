import { Injectable, Logger } from '@nestjs/common';
import { ProviderConfigService } from './provider-config.service';
import { SmsPort, SmsSendResult } from './sms.port';

/**
 * CallPro Text API adapter (api-text.callpro.mn).
 * Auth: x-api-key header. POST /send-sms {from, to, text} → {status, message_id}.
 * Credentials come from the tenant's saved integration settings (env fallback).
 */
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

    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/send-sms`, {
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
