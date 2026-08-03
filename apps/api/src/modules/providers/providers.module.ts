import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallProSmsAdapter } from './callpro-sms.adapter';
import { MockQpayAdapter } from './mock-qpay.adapter';
import { MockSmsAdapter } from './mock-sms.adapter';
import { QpayAdapter } from './qpay.adapter';
import { PAYMENT_PORT, SMS_PORT } from './sms.port';

/**
 * External integration adapters. The active payment/SMS provider is selected
 * by env (PAYMENT_PROVIDER=qpay_mock|qpay, SMS_PROVIDER=mock|callpro) so the
 * same build runs in demo mode and against the real contracts.
 */
@Global()
@Module({
  providers: [
    MockQpayAdapter,
    QpayAdapter,
    MockSmsAdapter,
    CallProSmsAdapter,
    {
      provide: PAYMENT_PORT,
      inject: [ConfigService, MockQpayAdapter, QpayAdapter],
      useFactory: (config: ConfigService, mock: MockQpayAdapter, qpay: QpayAdapter) =>
        config.get('PAYMENT_PROVIDER') === 'qpay' ? qpay : mock,
    },
    {
      provide: SMS_PORT,
      inject: [ConfigService, MockSmsAdapter, CallProSmsAdapter],
      useFactory: (config: ConfigService, mock: MockSmsAdapter, callpro: CallProSmsAdapter) =>
        config.get('SMS_PROVIDER') === 'callpro' ? callpro : mock,
    },
  ],
  exports: [PAYMENT_PORT, SMS_PORT, MockQpayAdapter, QpayAdapter],
})
export class ProvidersModule {}
