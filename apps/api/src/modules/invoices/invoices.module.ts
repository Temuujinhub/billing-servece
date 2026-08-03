import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { MessagingModule } from '../messaging/messaging.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [CustomersModule, MessagingModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
