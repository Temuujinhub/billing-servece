import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BonumAdapter } from './bonum.adapter';
import { CallProSmsAdapter } from './callpro-sms.adapter';
import { EbarimtOperatorService } from './ebarimt-operator.service';
import { EbarimtRegistryService } from './ebarimt-registry.service';
import { EBARIMT_PORT } from './ebarimt.port';
import { EMAIL_PORT } from './email.port';
import { IntegrationsController, TenantEbarimtController } from './integrations.controller';
import { MockEbarimtAdapter } from './mock-ebarimt.adapter';
import { MockEmailAdapter } from './mock-email.adapter';
import { MockQpayAdapter } from './mock-qpay.adapter';
import { MockSmsAdapter } from './mock-sms.adapter';
import { PosApiEbarimtAdapter } from './posapi-ebarimt.adapter';
import { ProviderConfigService } from './provider-config.service';
import { ProviderResolver } from './provider-resolver.service';
import { QpayAdapter } from './qpay.adapter';
import { QpayEbarimtAdapter } from './qpay-ebarimt.adapter';
import { SmtpEmailAdapter } from './smtp-email.adapter';

/**
 * External integration adapters + tenant-level provider settings.
 *
 * Payment/SMS adapters are resolved PER REQUEST via ProviderResolver (tenant
 * settings with env fallback: qpay_mock|qpay|bonum, mock|callpro) so the
 * dashboard flips mock ↔ real without a redeploy. eBarimt and email keep the
 * env-selected port tokens (EBARIMT_PROVIDER=mock|qpay|posapi,
 * EMAIL_PROVIDER=mock|smtp).
 */
@Global()
@Module({
  controllers: [IntegrationsController, TenantEbarimtController],
  providers: [
    ProviderConfigService,
    ProviderResolver,
    EbarimtRegistryService,
    EbarimtOperatorService,
    MockQpayAdapter,
    QpayAdapter,
    BonumAdapter,
    MockSmsAdapter,
    CallProSmsAdapter,
    MockEbarimtAdapter,
    QpayEbarimtAdapter,
    PosApiEbarimtAdapter,
    MockEmailAdapter,
    SmtpEmailAdapter,
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
    {
      provide: EMAIL_PORT,
      inject: [ConfigService, MockEmailAdapter, SmtpEmailAdapter],
      useFactory: (config: ConfigService, mock: MockEmailAdapter, smtp: SmtpEmailAdapter) =>
        config.get('EMAIL_PROVIDER') === 'smtp' ? smtp : mock,
    },
  ],
  exports: [
    ProviderConfigService,
    ProviderResolver,
    EbarimtRegistryService,
    EbarimtOperatorService,
    MockQpayAdapter,
    QpayAdapter,
    BonumAdapter,
    PosApiEbarimtAdapter,
    EBARIMT_PORT,
    EMAIL_PORT,
  ],
})
export class ProvidersModule {}
