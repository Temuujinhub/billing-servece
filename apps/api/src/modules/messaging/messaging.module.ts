import { Module } from '@nestjs/common';
import { DeliveryPollService } from './delivery-poll.service';
import { MessagingService } from './messaging.service';
import { ReminderService } from './reminder.service';

@Module({
  providers: [MessagingService, ReminderService, DeliveryPollService],
  exports: [MessagingService],
})
export class MessagingModule {}
