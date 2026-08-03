import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { ReminderService } from './reminder.service';

@Module({
  providers: [MessagingService, ReminderService],
  exports: [MessagingService],
})
export class MessagingModule {}
