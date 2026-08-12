import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { MessagingModule } from '../messaging/messaging.module';
import { BillingController, PublicPricingController } from './billing.controller';
import { BillingService } from './billing.service';
import { MonthCloseService } from './month-close.service';

@Module({
  imports: [InvoicesModule, MessagingModule],
  controllers: [BillingController, PublicPricingController],
  providers: [BillingService, MonthCloseService],
  exports: [BillingService, MonthCloseService],
})
export class BillingModule {}
