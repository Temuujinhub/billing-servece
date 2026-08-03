import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { TenantsController } from './tenants.controller';

@Module({
  controllers: [TenantsController, MembersController],
})
export class TenantsModule {}
