import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
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
}
