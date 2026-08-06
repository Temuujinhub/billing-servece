import { Injectable } from '@nestjs/common';
import { EbarimtCreateArgs, EbarimtCreateResult, EbarimtPort } from './ebarimt.port';
import { QpayAdapter } from './qpay.adapter';

/**
 * eBarimt via QPay's bundled /v2/ebarimt/create. Only valid when the payment
 * itself was settled through QPay (needs the QPay payment_id).
 */
@Injectable()
export class QpayEbarimtAdapter implements EbarimtPort {
  readonly code = 'ebarimt_qpay';

  constructor(private readonly qpay: QpayAdapter) {}

  async createReceipt(args: EbarimtCreateArgs): Promise<EbarimtCreateResult> {
    if (args.paymentProvider !== 'qpay') {
      throw new Error(`QPay eBarimt supports qpay payments only (got ${args.paymentProvider}); use EBARIMT_PROVIDER=posapi`);
    }
    const result = await this.qpay.createEbarimt(
      args.providerPaymentId,
      args.receiptType === 'ORGANIZATION' ? 'COMPANY' : 'CITIZEN',
      args.customerTin ?? undefined,
    );
    return { receiptNo: result.receiptNo, lottery: result.lottery, qrData: result.qrData };
  }
}
