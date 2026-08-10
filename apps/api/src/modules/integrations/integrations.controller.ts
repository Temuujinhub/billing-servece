import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IntegrationKind, Role } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { PartnerGuard } from '../../common/guards/partner.guard';
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

  // --- Партнёраас ирсэн хариу (approve үед tenant-д бичигдэнэ) ---
  // BONUM: терминалын credentials (нууцууд шифрлэгдэж хадгалагдана)
  @IsOptional() @IsString() @MaxLength(30) terminalId?: string;
  @IsOptional() @IsString() @MaxLength(300) appSecret?: string;
  @IsOptional() @IsString() @MaxLength(300) checksumKey?: string;
  // EBARIMT: ТЕГ/LIME бүртгэлийн утгууд
  @IsOptional() @IsString() @MaxLength(20) merchantTin?: string;
  @IsOptional() @IsString() @MaxLength(20) posNo?: string;
  @IsOptional() @IsString() @MaxLength(10) branchNo?: string;
  @IsOptional() @IsString() @MaxLength(10) districtCode?: string;
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
    return this.integrations.decide(user, id, dto.approved, dto.note, {
      terminalId: dto.terminalId,
      appSecret: dto.appSecret,
      checksumKey: dto.checksumKey,
      merchantTin: dto.merchantTin,
      posNo: dto.posNo,
      branchNo: dto.branchNo,
      districtCode: dto.districtCode,
    });
  }
}

/**
 * Хамтрагч байгууллагын (Bonum/LIME) ажилтнуудад зориулсан тусдаа хэсэг:
 * зөвхөн ӨӨРТ нь хамаарах бүртгэлийн хүсэлтүүдийг харж, бүртгэл хийгдмэгц
 * хариугаа (терминал/POS-ийн утгууд) бөглөж баталгаажуулна. Эрх нь
 * PARTNER_BONUM_EMAILS / PARTNER_EBARIMT_EMAILS env-ээр олгогдоно.
 */
@ApiTags('partner')
@ApiBearerAuth()
@UseGuards(PartnerGuard)
@Controller('partner/requests')
export class PartnerRequestsController {
  constructor(private readonly integrations: IntegrationsService) {}

  /** Партнёр өөрийн талын хүсэлтүүдийг л харна; админ бүгдийг харна. */
  private kindOf(user: AuthUser): IntegrationKind | undefined {
    if (user.partnerKind) return user.partnerKind as IntegrationKind;
    if (user.isAdmin) return undefined;
    throw apiError(HttpStatus.FORBIDDEN, 'PARTNER_ONLY', 'Хамтрагчийн эрх алга.', 'No partner access.');
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.integrations.listAll(status, this.kindOf(user));
  }

  @HttpCode(200)
  @Post(':id/decision')
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideRequestDto) {
    return this.integrations.decide(
      user,
      id,
      dto.approved,
      dto.note,
      {
        terminalId: dto.terminalId,
        appSecret: dto.appSecret,
        checksumKey: dto.checksumKey,
        merchantTin: dto.merchantTin,
        posNo: dto.posNo,
        branchNo: dto.branchNo,
        districtCode: dto.districtCode,
      },
      this.kindOf(user),
    );
  }
}
