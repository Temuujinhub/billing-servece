import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';

class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEnum(Role)
  role!: Role;
}

class ChangeRoleDto {
  @IsEnum(Role)
  role!: Role;
}

/** Team management (M-23): invite, change role, remove — OWNER only. */
@ApiTags('team')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('tenant/members')
export class MembersController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Invite: existing users are attached to the tenant; new users get an
   * auto-generated temporary password RETURNED ONCE (owner passes it on and
   * the member changes it later — no email channel in MVP).
   */
  @Post()
  async invite(@CurrentUser() user: AuthUser, @Body() dto: InviteMemberDto) {
    const email = dto.email.trim().toLowerCase();
    let tempPassword: string | null = null;

    const result = await this.prisma.$transaction(async (tx) => {
      let target = await tx.user.findUnique({ where: { email } });
      if (!target) {
        tempPassword = `Bs${randomBytes(6).toString('base64url')}!7`;
        target = await tx.user.create({
          data: { email, name: dto.name.trim(), passwordHash: await bcrypt.hash(tempPassword, 12) },
        });
      }
      const existing = await tx.membership.findUnique({
        where: { tenantId_userId: { tenantId: user.tenantId, userId: target.id } },
      });
      if (existing) {
        throw apiError(HttpStatus.CONFLICT, 'ALREADY_MEMBER', 'Энэ хэрэглэгч аль хэдийн гишүүн байна.', 'Already a member.');
      }
      const membership = await tx.membership.create({
        data: { tenantId: user.tenantId, userId: target.id, role: dto.role },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorId: user.userId, actorEmail: user.email,
          action: 'team.member.invited', targetType: 'membership', targetId: membership.id,
          meta: { email, role: dto.role },
        },
      });
      return membership;
    });

    return { membership: result, tempPassword };
  }

  @Patch(':membershipId')
  async changeRole(@CurrentUser() user: AuthUser, @Param('membershipId') membershipId: string, @Body() dto: ChangeRoleDto) {
    const membership = await this.prisma.membership.findFirst({ where: { id: membershipId, tenantId: user.tenantId } });
    if (!membership) throw apiError(HttpStatus.NOT_FOUND, 'MEMBER_NOT_FOUND', 'Гишүүн олдсонгүй.', 'Member not found.');
    if (membership.role === 'OWNER' && dto.role !== 'OWNER') {
      const owners = await this.prisma.membership.count({ where: { tenantId: user.tenantId, role: 'OWNER' } });
      if (owners <= 1) {
        throw apiError(HttpStatus.BAD_REQUEST, 'LAST_OWNER', 'Сүүлчийн эзэмшигчийн эрхийг бууруулах боломжгүй.', 'Cannot demote the last owner.');
      }
    }
    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { role: dto.role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId, actorId: user.userId, actorEmail: user.email,
        action: 'team.member.role_changed', targetType: 'membership', targetId: membershipId, meta: { role: dto.role },
      },
    });
    return updated;
  }

  @HttpCode(200)
  @Delete(':membershipId')
  async remove(@CurrentUser() user: AuthUser, @Param('membershipId') membershipId: string) {
    const membership = await this.prisma.membership.findFirst({ where: { id: membershipId, tenantId: user.tenantId } });
    if (!membership) throw apiError(HttpStatus.NOT_FOUND, 'MEMBER_NOT_FOUND', 'Гишүүн олдсонгүй.', 'Member not found.');
    if (membership.userId === user.userId) {
      throw apiError(HttpStatus.BAD_REQUEST, 'CANNOT_REMOVE_SELF', 'Өөрийгөө хасах боломжгүй.', 'You cannot remove yourself.');
    }
    if (membership.role === 'OWNER') {
      const owners = await this.prisma.membership.count({ where: { tenantId: user.tenantId, role: 'OWNER' } });
      if (owners <= 1) {
        throw apiError(HttpStatus.BAD_REQUEST, 'LAST_OWNER', 'Сүүлчийн эзэмшигчийг хасах боломжгүй.', 'Cannot remove the last owner.');
      }
    }
    await this.prisma.membership.delete({ where: { id: membershipId } });
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId, actorId: user.userId, actorEmail: user.email,
        action: 'team.member.removed', targetType: 'membership', targetId: membershipId,
      },
    });
    return { ok: true };
  }
}
