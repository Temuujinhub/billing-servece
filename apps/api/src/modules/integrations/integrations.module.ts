import { Module } from '@nestjs/common';
import { AdminIntegrationsController, IntegrationsController, PartnerRequestsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  controllers: [IntegrationsController, AdminIntegrationsController, PartnerRequestsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
