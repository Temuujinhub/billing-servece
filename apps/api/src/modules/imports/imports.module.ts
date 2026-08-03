import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [CustomersModule, InvoicesModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
