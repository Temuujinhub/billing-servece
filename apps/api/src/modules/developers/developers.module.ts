import { Global, Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { DevelopersController } from './developers.controller';
import { ApiKeyGuard, PartnerApiController } from './partner-api.controller';
import { WebhooksService } from './webhooks.service';

@Global() // WebhooksService is emitted from payments/receipts flows
@Module({
  imports: [InvoicesModule, ReceiptsModule, BillingModule],
  controllers: [DevelopersController, PartnerApiController],
  providers: [WebhooksService, ApiKeyGuard],
  exports: [WebhooksService],
})
export class DevelopersModule {}
