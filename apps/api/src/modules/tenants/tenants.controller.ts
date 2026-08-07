import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { encryptSecret } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { BonumAdapter } from '../providers/bonum.adapter';
import { EbarimtRegistryService } from '../providers/ebarimt-registry.service';

class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-ZА-ЯЁӨҮ0-9]{2,8}$/u, { message: 'Prefix нь 2–8 том үсэг/тоо байна' })
  invoicePrefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  regNo?: string;

  /** Татвар төлөгчийн дугаар (ТТД). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  smsTemplate?: string;

  /** Send SMS transliterated to Latin (GSM-7 → ~half the segment cost). */
  @IsOptional()
  @IsBoolean()
  smsTransliterate?: boolean;

  // KYB onboarding fields (M-03) + PSP onboarding (Bonum anket)
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @IsOptional() @IsString() @MaxLength(40) bankAccount?: string;
  @IsOptional() @IsString() @MaxLength(150) bankAccountName?: string;
  @IsOptional() @IsString() @MaxLength(150) representative?: string;

  // --- eBarimt POS API 3.0 — тухайн компанийн ӨӨРИЙН ТЕГ бүртгэл ---
  @IsOptional() @IsString() @MaxLength(20) ebarimtMerchantTin?: string;
  @IsOptional() @IsString() @MaxLength(20) ebarimtPosNo?: string;
  @IsOptional() @IsString() @MaxLength(10) ebarimtBranchNo?: string;
  @IsOptional() @IsString() @MaxLength(10) ebarimtDistrictCode?: string;

  // --- Bonum merchant credentials (write-only; шифрлэгдэж хадгалагдана) ---
  @IsOptional() @IsString() @MaxLength(30) bonumTerminalId?: string;
  @IsOptional() @IsString() @MaxLength(300) bonumAppSecret?: string;
  @IsOptional() @IsString() @MaxLength(300) bonumChecksumKey?: string;
}

/** Encrypted credential columns never leave the API — flags replace them. */
function publicTenant<T extends { bonumAppSecretEnc?: string | null; bonumChecksumKeyEnc?: string | null }>(tenant: T) {
  const { bonumAppSecretEnc, bonumChecksumKeyEnc, ...rest } = tenant;
  return {
    ...rest,
    hasBonumAppSecret: !!bonumAppSecretEnc,
    hasBonumChecksumKey: !!bonumChecksumKeyEnc,
  };
}

class EbarimtRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  regNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tin?: string;
}

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenant')
export class TenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly bonum: BonumAdapter,
    private readonly integrations: IntegrationsService,
    private readonly registry: EbarimtRegistryService,
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      include: { modules: true },
    });
    const team = await this.prisma.membership.findMany({
      where: { tenantId: user.tenantId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      tenant: publicTenant(tenant),
      team: team.map((m) => ({ id: m.id, role: m.role, user: m.user, since: m.createdAt })),
      me: user,
    };
  }

  @Roles(Role.OWNER)
  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateTenantDto) {
    if (dto.smsTemplate !== undefined && dto.smsTemplate.trim() && !dto.smsTemplate.includes('{{линк}}')) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'TEMPLATE_NEEDS_LINK',
        'Загварт {{линк}} хувьсагч заавал байх ёстой — үгүй бол төлөгч төлбөрөө хийж чадахгүй.',
        'The template must contain the {{линк}} variable.',
      );
    }
    // ТТД (= POS API-ийн merchantTin) автоматаар: регистр нь мэдэгдмэгц ТЕГ-ийн
    // нээлттэй бүртгэлээс татаж бөглөнө. Зөвхөн ХООСОН талбарыг бөглөх тул
    // партнёрын буцаасан эсвэл гараар оруулсан утгыг хэзээ ч дарж бичихгүй.
    let tin = dto.tin?.trim();
    let merchantTin = dto.ebarimtMerchantTin?.trim();
    let tinAutofilled = false;
    if (!tin || !merchantTin) {
      const current = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { regNo: true, tin: true, ebarimtMerchantTin: true },
      });
      const effectiveRegNo = dto.regNo?.trim() || current?.regNo || '';
      const needTin = !tin && !current?.tin;
      const needMerchantTin = !merchantTin && !current?.ebarimtMerchantTin;
      if ((needTin || needMerchantTin) && EbarimtRegistryService.isValidRegNo(effectiveRegNo)) {
        const info = await this.registry.lookup(effectiveRegNo);
        if (info.tin) {
          if (needTin) tin = info.tin;
          if (needMerchantTin) merchantTin = info.tin;
          tinAutofilled = true;
        }
      }
    }

    // Credentials are write-only: empty string means "leave unchanged".
    const encKey = this.config.getOrThrow<string>('ENCRYPTION_KEY');
    const secretUpdates: Record<string, string> = {};
    if (dto.bonumAppSecret?.trim()) secretUpdates.bonumAppSecretEnc = encryptSecret(encKey, dto.bonumAppSecret.trim());
    if (dto.bonumChecksumKey?.trim()) secretUpdates.bonumChecksumKeyEnc = encryptSecret(encKey, dto.bonumChecksumKey.trim());

    const tenant = await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        name: dto.name?.trim(),
        invoicePrefix: dto.invoicePrefix,
        regNo: dto.regNo?.trim(),
        tin,
        smsTemplate: dto.smsTemplate !== undefined ? dto.smsTemplate.trim() || null : undefined,
        smsTransliterate: dto.smsTransliterate,
        address: dto.address?.trim(),
        contactPhone: dto.contactPhone?.trim(),
        bankName: dto.bankName?.trim(),
        bankAccount: dto.bankAccount?.trim(),
        bankAccountName: dto.bankAccountName?.trim(),
        representative: dto.representative?.trim(),
        ebarimtMerchantTin: merchantTin,
        ebarimtPosNo: dto.ebarimtPosNo?.trim(),
        ebarimtBranchNo: dto.ebarimtBranchNo?.trim(),
        ebarimtDistrictCode: dto.ebarimtDistrictCode?.trim(),
        bonumTerminalId: dto.bonumTerminalId?.trim(),
        ...secretUpdates,
      },
    });
    // Adapter caches resolved credentials briefly — drop them on change.
    this.bonum.invalidateCreds(user.tenantId);
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.userId,
        actorEmail: user.email,
        action: 'tenant.updated',
        targetType: 'tenant',
        targetId: user.tenantId,
        meta: {
          bonumCredentialsChanged: Object.keys(secretUpdates).length > 0 || !!dto.bonumTerminalId,
          tinAutofilled,
        },
      },
    });
    // Товчгүй онбординг: мэдээлэл бүрэн болмогц идэвхжүүлэлтийн хүсэлт өөрөө
    // үүсч партнёрууд руу илгээгдэнэ (давхардал/өөрчлөлтгүй үед алгасна).
    const auto = await this.integrations.autoSubmit(user);
    return { ...publicTenant(tenant), autoSubmitted: auto.submitted };
  }

  /**
   * Live lookup against the open НӨАТ registry: регистрийн дугаар →
   * байгууллагын нэр + ТТД. ТТД нь POS API-ийн `merchantTin` мөн учраас
   * үүнийг л eBarimt баримт хэвлэхэд ашиглана.
   */
  @Roles(Role.OWNER)
  @Get('ebarimt-info')
  async ebarimtInfo(@Query('regNo') regNoRaw?: string) {
    const regNo = (regNoRaw ?? '').trim();
    if (!EbarimtRegistryService.isValidRegNo(regNo)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'REGNO_INVALID', 'Регистрийн дугаар буруу байна.', 'Invalid registration number.');
    }
    const info = await this.registry.lookup(regNo);
    if (!info.found) {
      throw apiError(
        HttpStatus.BAD_GATEWAY,
        'EBARIMT_INFO_UNAVAILABLE',
        'НӨАТ-ын бүртгэлийн сервис түр хариу өгөхгүй байна — регистрээ гараар оруулаад үргэлжлүүлж болно.',
        'The ebarimt registry is temporarily unavailable.',
      );
    }
    // merchantTin = ТТД: онбординг дээр гараар бичих зүйл үлдээхгүй.
    return { regNo: info.regNo, found: info.found, name: info.name, tin: info.tin, merchantTin: info.tin };
  }

  /** Onboarding step: eBarimt үүсгүүлэх хүсэлт — saves regNo/ТТД, enables the module. */
  @Roles(Role.OWNER)
  @HttpCode(200)
  @Post('ebarimt-request')
  async ebarimtRequest(@CurrentUser() user: AuthUser, @Body() dto: EbarimtRequestDto) {
    const regNo = dto.regNo.trim();
    // ТТД өгөөгүй бол бүртгэлээс автоматаар — энэ дугаараар л баримт хэвлэгдэнэ.
    const tin =
      dto.tin?.trim() ||
      (EbarimtRegistryService.isValidRegNo(regNo) ? (await this.registry.lookup(regNo)).tin : null);
    // merchantTin-ийг зөвхөн хоосон үед бөглөнө — партнёрын өгсөн утга дархгүй.
    const current = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { ebarimtMerchantTin: true },
    });
    const [tenant] = await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: user.tenantId },
        data: { regNo, tin, ...(tin && !current?.ebarimtMerchantTin ? { ebarimtMerchantTin: tin } : {}) },
      }),
      this.prisma.tenantModule.upsert({
        where: { tenantId_code: { tenantId: user.tenantId, code: 'EBARIMT' } },
        create: { tenantId: user.tenantId, code: 'EBARIMT', enabled: true },
        update: { enabled: true },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: user.tenantId, actorId: user.userId, actorEmail: user.email,
          action: 'ebarimt.requested', targetType: 'tenant', targetId: user.tenantId,
          meta: { regNo, tin },
        },
      }),
    ]);
    return { ok: true, regNo: tenant.regNo, tin: tenant.tin };
  }

  /** M-03 final step: submit the completed profile for platform review. */
  @Roles(Role.OWNER)
  @HttpCode(200)
  @Post('kyb-submit')
  async kybSubmit(@CurrentUser() user: AuthUser) {
    const tenant = await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { kybStatus: 'SUBMITTED' },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId, actorId: user.userId, actorEmail: user.email,
        action: 'kyb.submitted', targetType: 'tenant', targetId: user.tenantId,
      },
    });
    return publicTenant(tenant);
  }
}
