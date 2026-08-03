import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { BillingService } from './billing.service';

class ToggleModuleDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  quantity?: number;
}

@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.billing.overview(user.tenantId);
  }

  @Roles(Role.OWNER)
  @HttpCode(200)
  @Post('modules/:code')
  toggle(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: ToggleModuleDto) {
    return this.billing.toggleModule(user, code.toUpperCase(), dto.enabled, dto.quantity);
  }
}
