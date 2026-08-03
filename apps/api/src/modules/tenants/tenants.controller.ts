import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
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
