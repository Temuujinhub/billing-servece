import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [CustomersModule, InvoicesModule, MessagingModule, BillingModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
