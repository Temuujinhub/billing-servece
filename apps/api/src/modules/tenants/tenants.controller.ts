import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { encryptSecret } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { BonumAdapter } from '../providers/bonum.adapter';

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

  // --- PSP onboarding (Bonum anket — байгууллагын заавал бөглөх мэдээлэл) ---

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankAccountName?: string;

  // --- eBarimt POS API 3.0 — тухайн компанийн ӨӨРИЙН ТЕГ бүртгэл ---

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ebarimtMerchantTin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ebarimtPosNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  ebarimtBranchNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  ebarimtDistrictCode?: string;

  // --- Bonum merchant credentials (write-only; шифрлэгдэж хадгалагдана) ---

  @IsOptional()
  @IsString()
  @MaxLength(30)
  bonumTerminalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  bonumAppSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  bonumChecksumKey?: string;
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

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenant')
export class TenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly bonum: BonumAdapter,
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
        address: dto.address?.trim(),
        contactPhone: dto.contactPhone?.trim(),
        bankName: dto.bankName?.trim(),
        bankAccountNo: dto.bankAccountNo?.trim(),
        bankAccountName: dto.bankAccountName?.trim(),
        ebarimtMerchantTin: dto.ebarimtMerchantTin?.trim(),
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
        meta: { bonumCredentialsChanged: Object.keys(secretUpdates).length > 0 || !!dto.bonumTerminalId },
      },
    });
    return publicTenant(tenant);
  }
}
