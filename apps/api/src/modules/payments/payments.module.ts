import { Module } from '@nestjs/common';
import { ReceiptsModule } from '../receipts/receipts.module';
import { MockQpayAdapter } from './mock-qpay.adapter';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ReceiptsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MockQpayAdapter],
  exports: [PaymentsService],
})
export class PaymentsModule {}
