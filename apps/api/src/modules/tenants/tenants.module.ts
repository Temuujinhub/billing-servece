import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MembersController } from './members.controller';
import { TenantsController } from './tenants.controller';

@Module({
  // Тохиргоо хадгалагдахад идэвхжүүлэлтийн хүсэлт автоматаар илгээгдэнэ.
  imports: [IntegrationsModule],
  controllers: [TenantsController, MembersController],
})
export class TenantsModule {}
