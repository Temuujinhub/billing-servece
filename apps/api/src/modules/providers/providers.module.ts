import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BonumAdapter } from './bonum.adapter';
import { CallProSmsAdapter } from './callpro-sms.adapter';
import { EBARIMT_PORT } from './ebarimt.port';
import { MockEbarimtAdapter } from './mock-ebarimt.adapter';
import { MockQpayAdapter } from './mock-qpay.adapter';
import { MockSmsAdapter } from './mock-sms.adapter';
import { PosApiEbarimtAdapter } from './posapi-ebarimt.adapter';
import { QpayAdapter } from './qpay.adapter';
import { QpayEbarimtAdapter } from './qpay-ebarimt.adapter';
import { PAYMENT_PORT, SMS_PORT } from './sms.port';

/**
 * External integration adapters. The active provider of each kind is selected
 * by env (PAYMENT_PROVIDER=qpay_mock|qpay|bonum, SMS_PROVIDER=mock|callpro,
 * EBARIMT_PROVIDER=mock|qpay|posapi) so the same build runs in demo mode and
 * against the real contracts.
 */
@Global()
@Module({
  providers: [
    MockQpayAdapter,
    QpayAdapter,
    BonumAdapter,
    MockSmsAdapter,
    CallProSmsAdapter,
    MockEbarimtAdapter,
    QpayEbarimtAdapter,
    PosApiEbarimtAdapter,
    {
      provide: PAYMENT_PORT,
      inject: [ConfigService, MockQpayAdapter, QpayAdapter, BonumAdapter],
      useFactory: (config: ConfigService, mock: MockQpayAdapter, qpay: QpayAdapter, bonum: BonumAdapter) => {
        switch (config.get('PAYMENT_PROVIDER')) {
          case 'qpay':
            return qpay;
          case 'bonum':
            return bonum;
          default:
            return mock;
        }
      },
    },
    {
      provide: SMS_PORT,
      inject: [ConfigService, MockSmsAdapter, CallProSmsAdapter],
      useFactory: (config: ConfigService, mock: MockSmsAdapter, callpro: CallProSmsAdapter) =>
        config.get('SMS_PROVIDER') === 'callpro' ? callpro : mock,
    },
    {
      provide: EBARIMT_PORT,
      inject: [ConfigService, MockEbarimtAdapter, QpayEbarimtAdapter, PosApiEbarimtAdapter],
      useFactory: (config: ConfigService, mock: MockEbarimtAdapter, qpay: QpayEbarimtAdapter, posapi: PosApiEbarimtAdapter) => {
        switch (config.get('EBARIMT_PROVIDER')) {
          case 'qpay':
            return qpay;
          case 'posapi':
            return posapi;
          default:
            return mock;
        }
      },
    },
  ],
  exports: [PAYMENT_PORT, SMS_PORT, EBARIMT_PORT, MockQpayAdapter, QpayAdapter, BonumAdapter, PosApiEbarimtAdapter],
})
export class ProvidersModule {}
