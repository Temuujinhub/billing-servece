import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';
import { AdminOnly, AuthUser, CurrentUser, Roles } from '../../common/decorators';
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

  // Bonum төлбөрийн гарц (нууцууд write-only, шифрлэгдэж хадгалагдана)
  @IsOptional() @IsString() @MaxLength(30) terminalId?: string;
  @IsOptional() @IsString() @MaxLength(300) appSecret?: string;
  @IsOptional() @IsString() @MaxLength(300) checksumKey?: string;

  // eBarimt POS API 3.0 — компанийн ТЕГ бүртгэл
  @IsOptional() @IsString() @MaxLength(20) merchantTin?: string;
  @IsOptional() @IsString() @MaxLength(20) posNo?: string;
  @IsOptional() @IsString() @MaxLength(10) branchNo?: string;
  @IsOptional() @IsString() @MaxLength(10) districtCode?: string;
}

const PROVIDER_CODES: ProviderCode[] = ['QPAY', 'CALLPRO', 'BONUM', 'EBARIMT'];

function parseCode(code: string): ProviderCode {
  const upper = code.toUpperCase() as ProviderCode;
  if (!PROVIDER_CODES.includes(upper)) {
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

  /**
   * Ажиллаж буй CallPro тохиргоог платформ даяар нэг болгоно — бүх tenant-ийн
   * тусдаа (зөрүүтэй) CALLPRO тохиргоо устаж, нэг түлхүүр хэрэглэгдэнэ.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('CALLPRO/make-global')
  makeCallproGlobal(@CurrentUser() user: AuthUser, @Body() dto: SaveIntegrationDto) {
    return this.configs.makeCallproGlobal(user, dto);
  }

  /**
   * eBarimt: /rest/info-оос тухайн байгууллагын POS дугаарыг татаж авна.
   * Хэрэглэгч ebarimt.mn дээрээ операторын хүсэлтээ баталгаажуулсны дараа энэ
   * товчийг дарахад branchNo/posNo автоматаар бөглөгдөнө.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('EBARIMT/sync')
  syncEbarimt(@CurrentUser() user: AuthUser) {
    return this.configs.syncEbarimt(user);
  }

  /**
   * Онбордингийн 4-р алхам: ТЕГ рүү мерчант бүртгүүлэх хүсэлт илгээнэ.
   * Үүний дараа байгууллага ebarimt.mn дээрээ баталгаажуулна.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('EBARIMT/merchant-request')
  requestMerchant(@CurrentUser() user: AuthUser) {
    return this.configs.requestEbarimtMerchant(user);
  }
}

/**
 * Байгууллага ӨӨРӨӨ (OWNER) ТЕГ-ийн бүртгэлээ урагшлуулах боломж — админ
 * хүлээхгүйгээр онбордингоо өөрөө дуусгана. Хоёулаа user.tenantId дээр л
 * ажилладаг тул cross-tenant эрсдэлгүй.
 */
@ApiTags('integrations')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('tenant/ebarimt')
export class TenantEbarimtController {
  constructor(private readonly configs: ProviderConfigService) {}

  /** ТЕГ рүү мерчант бүртгүүлэх хүсэлт (saveOprMerchants) — өөрийн tenant. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('merchant-request')
  requestMerchant(@CurrentUser() user: AuthUser) {
    return this.configs.requestEbarimtMerchant(user);
  }

  /** POS дугаараа /rest/info-оос татах — өөрийн tenant. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('sync')
  sync(@CurrentUser() user: AuthUser) {
    return this.configs.syncEbarimt(user);
  }
}
