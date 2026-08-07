import { Module } from '@nestjs/common';
import { ReceiptPurgeService } from './receipt-purge.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

@Module({
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptPurgeService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
