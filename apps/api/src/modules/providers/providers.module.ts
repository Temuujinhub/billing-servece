import { Global, Module } from '@nestjs/common';
import { CallProSmsAdapter } from './callpro-sms.adapter';
import { IntegrationsController } from './integrations.controller';
import { MockQpayAdapter } from './mock-qpay.adapter';
import { MockSmsAdapter } from './mock-sms.adapter';
import { ProviderConfigService } from './provider-config.service';
import { ProviderResolver } from './provider-resolver.service';
import { QpayAdapter } from './qpay.adapter';

/**
 * External integration adapters + tenant-level provider settings. The active
 * payment/SMS adapter is resolved PER REQUEST via ProviderResolver, so the
 * dashboard can flip mock ↔ real (QPay, CallPro) without a redeploy.
 */
@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [
    ProviderConfigService,
    ProviderResolver,
    MockQpayAdapter,
    QpayAdapter,
    MockSmsAdapter,
    CallProSmsAdapter,
  ],
  exports: [ProviderConfigService, ProviderResolver, MockQpayAdapter, QpayAdapter],
})
export class ProvidersModule {}
