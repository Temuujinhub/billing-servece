import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/decorators';
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

  // EBARIMT_API-ийн шатлал (1..3)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  @Type(() => Number)
  tier?: number;
}

class TerminalStatusDto {
  @IsIn(['ACTIVE', 'BLOCKED'])
  status!: 'ACTIVE' | 'BLOCKED';
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
    return this.billing.toggleModule(user, code.toUpperCase(), dto.enabled, dto.quantity, dto.tier);
  }

  @Get('pos-terminals')
  terminals(@CurrentUser() user: AuthUser) {
    return this.billing.terminals(user.tenantId);
  }

  @Roles(Role.OWNER)
  @HttpCode(200)
  @Post('pos-terminals/:id/status')
  terminalStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TerminalStatusDto) {
    return this.billing.setTerminalStatus(user, id, dto.status);
  }

  @Get('bills')
  bills(@CurrentUser() user: AuthUser) {
    return this.billing.bills(user.tenantId);
  }
}

/** Landing калькулятор зэрэг нийтэд ил үнийн мэдээлэл — нэвтрэлт шаардахгүй. */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicPricingController {
  constructor(private readonly billing: BillingService) {}

  @Get('pricing')
  async pricing() {
    const p = await this.billing.pricing();
    return {
      INVOICE_MSG: p.INVOICE_MSG,
      API_INVOICE_MSG: p.API_INVOICE_MSG,
      EBARIMT_API_ONBOARDING: p.EBARIMT_API_ONBOARDING,
      EBARIMT_API_TIERS: p.EBARIMT_API_TIERS,
      POS_PER_DEVICE: p.POS_PER_DEVICE,
      VAT_PERCENT: p.VAT_PERCENT,
    };
  }
}
