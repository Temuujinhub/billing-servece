import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EmailPort, EmailSendResult } from './email.port';

/** MOCK email adapter — logs instead of sending (demo / local dev). */
@Injectable()
export class MockEmailAdapter implements EmailPort {
  readonly code = 'email_mock';
  private readonly logger = new Logger(MockEmailAdapter.name);

  async send(args: { to: string; subject: string; text: string; cc?: string }): Promise<EmailSendResult> {
    this.logger.log(`[mock-email] to=${args.to} subject="${args.subject}" (${args.text.length} chars)`);
    return { providerRef: `MEML-${randomUUID()}`, delivered: true };
  }
}
