import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';

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

  @IsOptional()
  @IsString()
  @MaxLength(320)
  smsTemplate?: string;

  // KYB onboarding fields (M-03)
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @IsOptional() @IsString() @MaxLength(40) bankAccount?: string;
  @IsOptional() @IsString() @MaxLength(150) representative?: string;
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

const EBARIMT_INFO_BASE = 'https://api.ebarimt.mn/api/info/check';

/** Best-effort JSON GET against the open ebarimt registry (8s cap, no auth). */
async function ebarimtInfoGet(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${EBARIMT_INFO_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenant')
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

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
      tenant,
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
    const tenant = await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        name: dto.name?.trim(),
        invoicePrefix: dto.invoicePrefix,
        regNo: dto.regNo?.trim(),
        smsTemplate: dto.smsTemplate !== undefined ? dto.smsTemplate.trim() || null : undefined,
        address: dto.address?.trim(),
        bankName: dto.bankName?.trim(),
        bankAccount: dto.bankAccount?.trim(),
        representative: dto.representative?.trim(),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.userId,
        actorEmail: user.email,
        action: 'tenant.updated',
        targetType: 'tenant',
        targetId: user.tenantId,
      },
    });
    return tenant;
  }

  /**
   * Живой lookup against the НӨАТ registry: регистрийн дугаар → байгууллагын
   * нэр + ТТД (татвар төлөгчийн дугаар). Open endpoints, no credentials.
   */
  @Roles(Role.OWNER)
  @Get('ebarimt-info')
  async ebarimtInfo(@Query('regNo') regNoRaw?: string) {
    const regNo = (regNoRaw ?? '').trim();
    // ААН: 7–10 оронтой тоо; иргэн: УБ00112233 хэлбэрийн 2 кирилл + 8 тоо.
    if (!/^([0-9]{7,10}|[А-ЯЁӨҮ]{2}[0-9]{8})$/u.test(regNo)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'REGNO_INVALID', 'Регистрийн дугаар буруу байна.', 'Invalid registration number.');
    }
    const [info, tinInfo] = await Promise.all([
      ebarimtInfoGet(`/getInfo?regNo=${encodeURIComponent(regNo)}`),
      ebarimtInfoGet(`/getTinInfo?regNo=${encodeURIComponent(regNo)}`),
    ]);
    if (info === null && tinInfo === null) {
      throw apiError(
        HttpStatus.BAD_GATEWAY,
        'EBARIMT_INFO_UNAVAILABLE',
        'НӨАТ-ын бүртгэлийн сервис түр хариу өгөхгүй байна — регистрээ гараар оруулаад үргэлжлүүлж болно.',
        'The ebarimt registry is temporarily unavailable.',
      );
    }
    const tin = tinInfo?.data != null ? String(tinInfo.data) : null;
    return {
      regNo,
      found: info?.found === true || Boolean(tin),
      name: typeof info?.name === 'string' && info.name.trim() ? info.name.trim() : null,
      tin,
    };
  }

  /** Onboarding step: eBarimt үүсгүүлэх хүсэлт — saves regNo/ТТД, enables the module. */
  @Roles(Role.OWNER)
  @HttpCode(200)
  @Post('ebarimt-request')
  async ebarimtRequest(@CurrentUser() user: AuthUser, @Body() dto: EbarimtRequestDto) {
    const regNo = dto.regNo.trim();
    const tin = dto.tin?.trim() || null;
    const [tenant] = await this.prisma.$transaction([
      this.prisma.tenant.update({ where: { id: user.tenantId }, data: { regNo, tin } }),
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
    return tenant;
  }
}
