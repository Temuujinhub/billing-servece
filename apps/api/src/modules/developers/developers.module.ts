import { Global, Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { DevelopersController } from './developers.controller';
import { ApiKeyGuard, PartnerApiController } from './partner-api.controller';
import { WebhooksService } from './webhooks.service';

@Global() // WebhooksService is emitted from payments/receipts flows
@Module({
  imports: [InvoicesModule],
  controllers: [DevelopersController, PartnerApiController],
  providers: [WebhooksService, ApiKeyGuard],
  exports: [WebhooksService],
})
export class DevelopersModule {}
