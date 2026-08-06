import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { IntegrationsService } from './integrations.service';

class SubmitRequestDto {
  @IsIn(['BONUM', 'EBARIMT'])
  kind!: 'BONUM' | 'EBARIMT';
}

class DecideRequestDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Tenant-facing: анкет бүрэн үед Bonum/LIME бүртгэлийн хүсэлт илгээнэ. */
@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('requests')
  listMine(@CurrentUser() user: AuthUser) {
    return this.integrations.listMine(user.tenantId);
  }

  @Roles(Role.OWNER)
  @HttpCode(200)
  @Post('requests')
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitRequestDto) {
    return this.integrations.submit(user, dto.kind);
  }
}

/** Platform staff: бүх tenant-ийн бүртгэлийн хүсэлтийг хянаж шийднэ. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('admin/integration-requests')
export class AdminIntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.integrations.listAll(status);
  }

  @HttpCode(200)
  @Post(':id/resend-email')
  resend(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.integrations.resendEmail(user, id);
  }

  @HttpCode(200)
  @Post(':id/decision')
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideRequestDto) {
    return this.integrations.decide(user, id, dto.approved, dto.note);
  }
}
