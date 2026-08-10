import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SmsPort, SmsSendResult } from './sms.port';

/** Records the send without leaving the platform. */
@Injectable()
export class MockSmsAdapter implements SmsPort {
  readonly code = 'mock';
  private readonly logger = new Logger(MockSmsAdapter.name);

  async send(args: { tenantId: string; to: string; text: string }): Promise<SmsSendResult> {
    this.logger.log(`[mock-sms] → ${args.to} (${args.text.length} chars)`);
    return { providerRef: `MOCK-${randomUUID().slice(0, 8)}`, delivered: true };
  }
}
