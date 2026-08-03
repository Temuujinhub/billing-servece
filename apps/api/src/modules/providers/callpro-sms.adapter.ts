import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsPort, SmsSendResult } from './sms.port';

/**
 * CallPro Text API adapter (api-text.callpro.mn).
 * Auth: x-api-key header. POST /send-sms {from, to, text} → {status, message_id}.
 * Delivery status can later be polled via GET /message-detail/{message_id}.
 */
@Injectable()
export class CallProSmsAdapter implements SmsPort {
  readonly code = 'callpro';
  private readonly logger = new Logger(CallProSmsAdapter.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return (this.config.get<string>('CALLPRO_BASE_URL') ?? 'https://api-text.callpro.mn/v1/sms').replace(/\/$/, '');
  }

  async send(args: { to: string; text: string }): Promise<SmsSendResult> {
    const apiKey = this.config.get<string>('CALLPRO_API_KEY');
    const from = this.config.get<string>('CALLPRO_FROM');
    if (!apiKey || !from) {
      throw new Error('CallPro SMS is not configured (CALLPRO_API_KEY / CALLPRO_FROM)');
    }
    // CallPro accepts 8-digit local numbers; strip the +976 prefix we normalize to.
    const to = args.to.replace(/^\+?976/, '');

    const res = await fetch(`${this.baseUrl}/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ from, to, text: args.text }),
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
