import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [PaymentsModule, ReceiptsModule, MessagingModule, BillingModule],
  controllers: [AdminController],
  providers: [AdminService, BootstrapService],
  exports: [AdminService],
})
export class AdminModule {}
