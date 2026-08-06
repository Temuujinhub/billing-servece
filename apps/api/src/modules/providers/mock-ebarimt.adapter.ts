import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { EbarimtCreateArgs, EbarimtCreateResult, EbarimtPort } from './ebarimt.port';

/**
 * MOCK eBarimt adapter — generates realistic local receipts (no tax authority
 * involved). Kept behaviour-identical to the pre-port implementation so demo
 * environments are unaffected by the posapi integration.
 */
@Injectable()
export class MockEbarimtAdapter implements EbarimtPort {
  readonly code = 'ebarimt_mock';

  async createReceipt(_args: EbarimtCreateArgs): Promise<EbarimtCreateResult> {
    const lottery = `${this.block(2)} ${this.block(2)} ${this.block(6)}`;
    return {
      receiptNo: randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase(),
      lottery,
      qrData: randomBytes(48).toString('base64'),
    };
  }

  private block(n: number): string {
    const chars = '0123456789';
    return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
}
