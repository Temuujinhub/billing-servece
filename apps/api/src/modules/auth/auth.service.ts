import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { apiError } from '../../common/filters/http-exception.filter';
import { AuthUser } from '../../common/decorators';
import { normalizeMnPhone, sha256 } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Self-service onboarding: user + tenant + owner membership in ONE transaction. */
  async register(dto: RegisterDto) {
    // Admin kill-switch (feature flag A-17): pause self-service signups.
    const flags = await this.prisma.platformSetting.findUnique({ where: { key: 'features' } });
    if (flags && (flags.value as any)?.registrationOpen === false) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'REGISTRATION_CLOSED',
        'Шинэ бүртгэл түр хаалттай байна. Удахгүй нээгдэнэ.',
        'Self-service registration is temporarily closed.',
      );
    }
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone ? normalizeMnPhone(dto.phone) : null;
    if (dto.phone && !phone) {
      throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_PHONE', 'Утасны дугаар буруу байна.', 'Invalid Mongolian phone number.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw apiError(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Энэ имэйл аль хэдийн бүртгэлтэй байна.', 'This email is already registered.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const { user, tenant, membership } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, phone, name: dto.name.trim(), passwordHash },
      });
      const tenant = await tx.tenant.create({
        data: {
          name: dto.organizationName.trim(),
          type: dto.tenantType ?? 'ORGANIZATION',
          regNo: dto.regNo?.trim() || null,
          contactEmail: email,
          contactPhone: phone,
          kybStatus: 'SUBMITTED',
          invoiceSeq: { create: {} },
          modules: {
            create: [
              { code: 'SMS', enabled: true },
              { code: 'EBARIMT', enabled: false },
              { code: 'POS', enabled: false, quantity: 0 },
              { code: 'REMINDER', enabled: false },
            ],
          },
        },
      });
      const membership = await tx.membership.create({
        data: { tenantId: tenant.id, userId: user.id, role: Role.OWNER },
      });
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: user.id,
          actorEmail: email,
          action: 'tenant.registered',
          targetType: 'tenant',
          targetId: tenant.id,
        },
      });
      return { user, tenant, membership };
    });

    return this.issueTokens({
      userId: user.id,
      email,
      name: user.name,
      tenantId: tenant.id,
      role: membership.role,
      isAdmin: this.isAdminUser(email, user.platformAdmin),
      partnerKind: this.partnerKindFor(email),
    });
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: { include: { tenant: true }, orderBy: { createdAt: 'asc' } } },
    });
    // Same error for unknown email vs wrong password — no account enumeration.
    const invalid = apiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Имэйл эсвэл нууц үг буруу байна.', 'Invalid email or password.');
    if (!user) throw invalid;
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw invalid;

    const membership = user.memberships[0];
    if (!membership || membership.tenant.status !== 'ACTIVE') {
      throw apiError(HttpStatus.FORBIDDEN, 'TENANT_INACTIVE', 'Байгууллагын бүртгэл идэвхгүй байна.', 'Tenant is not active.');
    }

    return this.issueTokens({
      userId: user.id,
      email: user.email,
      name: user.name,
      tenantId: membership.tenantId,
      role: membership.role,
      isAdmin: this.isAdminUser(user.email, user.platformAdmin),
      partnerKind: this.partnerKindFor(user.email),
    });
  }

  async refresh(refreshToken: string) {
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw apiError(HttpStatus.UNAUTHORIZED, 'INVALID_REFRESH', 'Дахин нэвтэрнэ үү.', 'Refresh token is invalid or expired.');
    }
    // Rotation: a refresh token is single-use.
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const membership = await this.prisma.membership.findFirst({
      where: { userId: stored.userId },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      throw apiError(HttpStatus.UNAUTHORIZED, 'NO_TENANT', 'Байгууллагын хандалт олдсонгүй.', 'No tenant membership found.');
    }
    return this.issueTokens({
      userId: stored.user.id,
      email: stored.user.email,
      name: stored.user.name,
      tenantId: membership.tenantId,
      role: membership.role,
      isAdmin: this.isAdminUser(stored.user.email, stored.user.platformAdmin),
      partnerKind: this.partnerKindFor(stored.user.email),
    });
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return { ok: true };
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  /** Партнёрын ажилтны эрх — env allowlist (PARTNER_BONUM_EMAILS / PARTNER_EBARIMT_EMAILS). */
  private partnerKindFor(email: string): 'BONUM' | 'EBARIMT' | null {
    const inList = (key: string) =>
      (this.config.get<string>(key) ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
        .includes(email.toLowerCase());
    if (inList('PARTNER_BONUM_EMAILS')) return 'BONUM';
    if (inList('PARTNER_EBARIMT_EMAILS')) return 'EBARIMT';
    return null;
  }

  /** platformAdmin column OR the ADMIN_EMAILS env allowlist. */
  private isAdminUser(email: string, platformAdmin: boolean): boolean {
    if (platformAdmin) return true;
    const list = (this.config.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return list.includes(email.toLowerCase());
  }

  private async issueTokens(claims: AuthUser) {
    const accessTtl = Number(this.config.get('JWT_ACCESS_TTL') ?? 900);
    const refreshTtl = Number(this.config.get('JWT_REFRESH_TTL') ?? 604800);

    const accessToken = await this.jwt.signAsync(
      {
        sub: claims.userId,
        email: claims.email,
        name: claims.name,
        tenantId: claims.tenantId,
        role: claims.role,
        isAdmin: claims.isAdmin,
        partnerKind: claims.partnerKind ?? null,
      },
      { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: accessTtl },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: claims.userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTtl,
      user: {
        id: claims.userId,
        email: claims.email,
        name: claims.name,
        role: claims.role,
        tenantId: claims.tenantId,
        isAdmin: claims.isAdmin,
        partnerKind: claims.partnerKind ?? null,
      },
    };
  }
}
