import { Injectable } from '@nestjs/common';
import { CallProSmsAdapter } from './callpro-sms.adapter';
import { MockQpayAdapter } from './mock-qpay.adapter';
import { MockSmsAdapter } from './mock-sms.adapter';
import { PaymentProviderPort } from './payment-provider.port';
import { ProviderConfigService } from './provider-config.service';
import { QpayAdapter } from './qpay.adapter';
import { SmsPort } from './sms.port';

/**
 * Picks the live adapter per tenant based on saved provider settings
 * (falling back to env). Lets the dashboard flip mock ↔ real without a
 * redeploy — the next request simply resolves the other adapter.
 */
@Injectable()
export class ProviderResolver {
  constructor(
    private readonly configs: ProviderConfigService,
    private readonly qpay: QpayAdapter,
    private readonly qpayMock: MockQpayAdapter,
    private readonly callpro: CallProSmsAdapter,
    private readonly smsMock: MockSmsAdapter,
  ) {}

  async getPaymentPort(tenantId: string): Promise<PaymentProviderPort> {
    const cfg = await this.configs.getQpay(tenantId);
    return cfg.enabled && cfg.username && cfg.password && cfg.invoiceCode ? this.qpay : this.qpayMock;
  }

  async getSmsPort(tenantId: string): Promise<SmsPort> {
    const cfg = await this.configs.getCallpro(tenantId);
    return cfg.enabled && cfg.apiKey && cfg.from ? this.callpro : this.smsMock;
  }
}
