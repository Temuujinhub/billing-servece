import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminOnly, AuthUser, CurrentUser } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { ProviderCode, ProviderConfigService } from './provider-config.service';

class SaveIntegrationDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  baseUrl?: string;

  // QPay fields
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceCode?: string;

  // CallPro fields
  @IsOptional()
  @IsString()
  @MaxLength(200)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  from?: string;
}

function parseCode(code: string): ProviderCode {
  const upper = code.toUpperCase();
  if (upper !== 'QPAY' && upper !== 'CALLPRO') {
    throw apiError(HttpStatus.NOT_FOUND, 'UNKNOWN_PROVIDER', 'Ийм интеграци алга.', `Unknown provider ${code}.`);
  }
  return upper;
}

/** Provider settings — platform-admin area only, secrets stay masked. */
@ApiTags('integrations')
@ApiBearerAuth()
@AdminOnly()
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly configs: ProviderConfigService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.configs.list(user.tenantId);
  }

  @Put(':code')
  save(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: SaveIntegrationDto) {
    return this.configs.save(user, parseCode(code), dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':code/test')
  test(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.configs.test(user.tenantId, parseCode(code));
  }
}
