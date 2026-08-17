import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';
import { apiError } from '../../common/filters/http-exception.filter';
import { AuthUser } from '../../common/decorators';
import { normalizeMnPhone, sha256 } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderResolver } from '../providers/provider-resolver.service';
import { ChangePasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';

const BCRYPT_ROUNDS = 12;
// B-44 lockout: MAX_FAILED удаа дараалан буруу → LOCK_MINUTES түгжинэ.
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
// SMS сэргээх код: амьдрах хугацаа ба оролдлогын дээд хязгаар.
const RESET_CODE_TTL_MINUTES = 10;
const RESET_CODE_MAX_ATTEMPTS = 5;
// Админ SMS 2FA (SCA): нэвтрэлтийн 2-р алхмын кодын тохиргоо.
const TWO_FACTOR_TTL_MINUTES = 5;
const TWO_FACTOR_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly providers: ProviderResolver,
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
              // Үйлчилгээ 1 (Excel/дашбоард нэхэмжлэх + SMS) шууд нээлттэй.
              { code: 'EXCEL_SMS', enabled: true },
              // Үйлчилгээ 2–4 сонголтоор идэвхжинэ.
              { code: 'API_SMS', enabled: false, quantity: 0 },
              { code: 'EBARIMT_API', enabled: false, quantity: 0, tier: 1 },
              { code: 'POS_EBARIMT', enabled: false, quantity: 0 },
              // Туслах: eBarimt холболт (интеграц батлагдахад асна) + сануулга.
              { code: 'EBARIMT', enabled: false },
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

  /**
   * OWASP A09: нэвтрэлтийн амжилт/бүтэлгүйтэл хоёуланг нь audit log-д бичнэ —
   * credential stuffing/brute force-ийг Admin → Audit хуудаснаас мөшгих
   * боломжтой. Бичилт нь нэвтрэлтийг хэзээ ч унагахгүй (catch → үл тоомсорлоно).
   */
  private logAuthEvent(
    action:
      | 'auth.login_failed'
      | 'auth.login_succeeded'
      | 'auth.login_locked'
      | 'auth.password_changed'
      | 'auth.password_reset_requested'
      | 'auth.password_reset_completed'
      | 'auth.password_reset_failed'
      | 'auth.2fa_challenge_sent',
    email: string,
    ip?: string,
    tenantId?: string,
  ) {
    void this.prisma.auditLog
      .create({ data: { action, targetType: 'auth', tenantId, actorEmail: email, meta: { ip: ip ?? null } } })
      .catch(() => undefined);
  }

  async login(dto: LoginDto, ip?: string) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: { include: { tenant: true }, orderBy: { createdAt: 'asc' } } },
    });
    // Same error for unknown email vs wrong password — no account enumeration.
    const invalid = apiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Имэйл эсвэл нууц үг буруу байна.', 'Invalid email or password.');
    if (!user) {
      this.logAuthEvent('auth.login_failed', email, ip);
      throw invalid;
    }

    // B-44: түгжигдсэн данс — нууц үг зөв ч нэвтрүүлэхгүй (brute force-ийг
    // эцсийн амжилттай оролдлогоор нь ч шагнахгүй).
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
      this.logAuthEvent('auth.login_locked', email, ip);
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'ACCOUNT_LOCKED',
        `Олон удаагийн буруу оролдлогын улмаас данс түр түгжигдлээ. ${minutes} минутын дараа дахин оролдоно уу.`,
        `Account temporarily locked. Try again in ${minutes} minute(s).`,
      );
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.user
        .update({
          where: { id: user.id },
          data: {
            failedLoginCount: lock ? 0 : failed,
            lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
          },
        })
        .catch(() => undefined);
      this.logAuthEvent('auth.login_failed', email, ip);
      throw invalid;
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user
        .update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } })
        .catch(() => undefined);
    }

    const membership = user.memberships[0];
    if (!membership || membership.tenant.status !== 'ACTIVE') {
      throw apiError(HttpStatus.FORBIDDEN, 'TENANT_INACTIVE', 'Байгууллагын бүртгэл идэвхгүй байна.', 'Tenant is not active.');
    }

    // SCA (B-56): ADMIN_2FA=true үед платформын админ нэвтрэхдээ утсандаа
    // ирсэн 6 оронтой кодоор давхар баталгаажна. Утасгүй админд алхам алгасна
    // (SMS явахгүй нөхцөлд өөрийгөө түгжихээс сэргийлсэн зориудын сонголт).
    const isAdmin = this.isAdminUser(user.email, user.platformAdmin);
    if (this.config.get('ADMIN_2FA') === 'true' && isAdmin && user.phone) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorCodeHash: sha256(code),
          twoFactorExpiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MINUTES * 60_000),
          twoFactorAttempts: 0,
        },
      });
      try {
        const port = await this.providers.getSmsPort(membership.tenantId);
        await port.send({
          tenantId: membership.tenantId,
          to: user.phone,
          text: `msgbill.mn admin: Nevtreh batalgaajuulah kod: ${code} (${TWO_FACTOR_TTL_MINUTES} minut huchintei).`,
        });
      } catch (e: any) {
        this.logger.warn(`2FA SMS send failed for ${user.email}: ${e?.message}`);
      }
      this.logAuthEvent('auth.2fa_challenge_sent', user.email, ip, membership.tenantId);
      return {
        twoFactorRequired: true as const,
        message: `Бүртгэлтэй утас руу ${TWO_FACTOR_TTL_MINUTES} минут хүчинтэй 6 оронтой код илгээлээ.`,
      };
    }

    this.logAuthEvent('auth.login_succeeded', user.email, ip, membership.tenantId);
    return this.issueTokens(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        tenantId: membership.tenantId,
        role: membership.role,
        isAdmin,
        partnerKind: this.partnerKindFor(user.email),
      },
      { mustChangePassword: user.mustChangePassword },
    );
  }

  /** SCA 2-р алхам: SMS кодыг тулгаад токен олгоно. */
  async verifyTwoFactor(email: string, code: string, ip?: string) {
    const normalized = email.trim().toLowerCase();
    const invalid = apiError(HttpStatus.UNAUTHORIZED, 'INVALID_2FA_CODE', 'Код буруу эсвэл хугацаа нь дууссан байна.', 'Invalid or expired verification code.');
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      include: { memberships: { include: { tenant: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!user?.twoFactorCodeHash || !user.twoFactorExpiresAt || user.twoFactorExpiresAt < new Date()) {
      throw invalid;
    }
    if (user.twoFactorAttempts >= TWO_FACTOR_MAX_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { twoFactorCodeHash: null, twoFactorExpiresAt: null, twoFactorAttempts: 0 },
      });
      throw invalid;
    }
    if (sha256(code) !== user.twoFactorCodeHash) {
      await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorAttempts: { increment: 1 } } });
      this.logAuthEvent('auth.login_failed', normalized, ip);
      throw invalid;
    }
    const membership = user.memberships[0];
    if (!membership || membership.tenant.status !== 'ACTIVE') {
      throw apiError(HttpStatus.FORBIDDEN, 'TENANT_INACTIVE', 'Байгууллагын бүртгэл идэвхгүй байна.', 'Tenant is not active.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorCodeHash: null, twoFactorExpiresAt: null, twoFactorAttempts: 0 },
    });
    this.logAuthEvent('auth.login_succeeded', user.email, ip, membership.tenantId);
    return this.issueTokens(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        tenantId: membership.tenantId,
        role: membership.role,
        isAdmin: this.isAdminUser(user.email, user.platformAdmin),
        partnerKind: this.partnerKindFor(user.email),
      },
      { mustChangePassword: user.mustChangePassword },
    );
  }

  async refresh(refreshToken: string) {
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
    // Zero Trust / reuse detection (B-50): НЭГЭНТ солигдсон token дахин ирж
    // байна = token хулгайлагдсаны дохио (жинхэнэ клиент шинэ token-оо аль
    // хэдийн авсан). Тухайн хэрэглэгчийн БҮХ идэвхтэй session-ыг унтрааж,
    // хоёр тал (хулгайч + эзэн) дахин нэвтрэхийг шаардана.
    if (stored?.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      void this.prisma.auditLog
        .create({
          data: {
            action: 'auth.refresh_reuse_detected',
            targetType: 'auth',
            actorEmail: stored.user.email,
            meta: { tokenId: stored.id },
          },
        })
        .catch(() => undefined);
      throw apiError(HttpStatus.UNAUTHORIZED, 'INVALID_REFRESH', 'Дахин нэвтэрнэ үү.', 'Refresh token is invalid or expired.');
    }
    if (!stored || stored.expiresAt < new Date()) {
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
    return this.issueTokens(
      {
        userId: stored.user.id,
        email: stored.user.email,
        name: stored.user.name,
        tenantId: membership.tenantId,
        role: membership.role,
        isAdmin: this.isAdminUser(stored.user.email, stored.user.platformAdmin),
        partnerKind: this.partnerKindFor(stored.user.email),
      },
      { mustChangePassword: stored.user.mustChangePassword },
    );
  }

  /** Нэвтэрсэн хэрэглэгч өөрийн нууц үгээ солино (B-45). */
  async changePassword(user: AuthUser, dto: ChangePasswordDto, ip?: string) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
    const ok = await bcrypt.compare(dto.currentPassword, record.passwordHash);
    if (!ok) {
      throw apiError(HttpStatus.UNAUTHORIZED, 'WRONG_PASSWORD', 'Одоогийн нууц үг буруу байна.', 'Current password is incorrect.');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw apiError(HttpStatus.BAD_REQUEST, 'SAME_PASSWORD', 'Шинэ нууц үг хуучинтай ижил байж болохгүй.', 'New password must differ from the current one.');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.id },
        data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
      }),
      // Бусад төхөөрөмж дээрх session-уудыг унтраана — хулгайлагдсан нууц
      // үгээр авсан refresh token солигдсоны дараа ажиллах ёсгүй.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    this.logAuthEvent('auth.password_changed', record.email, ip, user.tenantId);
    return { ok: true };
  }

  /**
   * Нууц үг сэргээх 1-р алхам: дансны бүртгэлтэй утас руу 6 оронтой код
   * SMS-ээр илгээнэ. Данс байгаа эсэхээс ҮЛ ХАМААРАН ижил хариу буцаана
   * (account enumeration хаалттай); утасгүй данс код авахгүй.
   */
  async forgotPassword(email: string, ip?: string) {
    const normalized = email.trim().toLowerCase();
    // Хариу нь data-гаас хамаарахгүй тул нэг л мессеж.
    const response = {
      ok: true,
      message: 'Хэрэв энэ имэйл бүртгэлтэй бөгөөд утасны дугаартай бол сэргээх код SMS-ээр очно.',
    };
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      include: { memberships: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (!user?.phone) return response;

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetCodeHash: sha256(code),
        resetCodeExpiresAt: new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60_000),
        resetCodeAttempts: 0,
      },
    });
    this.logAuthEvent('auth.password_reset_requested', normalized, ip, user.memberships[0]?.tenantId);

    // Платформын үйлчилгээний SMS — MessageJob/тарифт тооцогдохгүй, шууд
    // портоор (tenant → глобал → env түлхүүрийн fallback-тай) илгээнэ.
    try {
      const tenantId = user.memberships[0]?.tenantId ?? '';
      const port = await this.providers.getSmsPort(tenantId);
      await port.send({
        tenantId,
        to: user.phone,
        text: `msgbill.mn: Nuuts ug sergeeh kod: ${code} (${RESET_CODE_TTL_MINUTES} minut huchintei). Ta huselt gargaagui bol ene SMS-iig umartana uu.`,
      });
    } catch (e: any) {
      // Илгээлт бүтэлгүйтсэнийг дотооддоо log-лоно, гаднаа мэдэгдэхгүй.
      this.logger.warn(`Reset SMS send failed for ${normalized}: ${e?.message}`);
    }
    return response;
  }

  /** Нууц үг сэргээх 2-р алхам: код тулгаад шинэ нууц үг тавина. */
  async resetPassword(dto: ResetPasswordDto, ip?: string) {
    const email = dto.email.trim().toLowerCase();
    const invalid = apiError(HttpStatus.BAD_REQUEST, 'INVALID_RESET_CODE', 'Код буруу эсвэл хугацаа нь дууссан байна.', 'Invalid or expired reset code.');
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.resetCodeHash || !user.resetCodeExpiresAt || user.resetCodeExpiresAt < new Date()) {
      this.logAuthEvent('auth.password_reset_failed', email, ip);
      throw invalid;
    }
    if (user.resetCodeAttempts >= RESET_CODE_MAX_ATTEMPTS) {
      // Код brute-force-лохоос сэргийлж кодыг нь хүчингүй болгоно.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetCodeHash: null, resetCodeExpiresAt: null, resetCodeAttempts: 0 },
      });
      this.logAuthEvent('auth.password_reset_failed', email, ip);
      throw invalid;
    }
    if (sha256(dto.code) !== user.resetCodeHash) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetCodeAttempts: { increment: 1 } },
      });
      this.logAuthEvent('auth.password_reset_failed', email, ip);
      throw invalid;
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
          resetCodeHash: null,
          resetCodeExpiresAt: null,
          resetCodeAttempts: 0,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    this.logAuthEvent('auth.password_reset_completed', email, ip);
    return { ok: true, message: 'Нууц үг шинэчлэгдлээ. Шинэ нууц үгээрээ нэвтэрнэ үү.' };
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

  /** platformAdmin column OR the ADMIN_EMAILS / PLATFORM_ADMIN_EMAILS env allowlists. */
  private isAdminUser(email: string, platformAdmin: boolean): boolean {
    if (platformAdmin) return true;
    // PLATFORM_ADMIN_EMAILS — хуучин нэр; серверийн .env-үүд аль алиныг нь
    // ашиглаж байсан тул хоёуланг нь хүлээн зөвшөөрнө.
    const list = `${this.config.get<string>('ADMIN_EMAILS') ?? ''},${this.config.get<string>('PLATFORM_ADMIN_EMAILS') ?? ''}`
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return list.includes(email.toLowerCase());
  }

  private async issueTokens(claims: AuthUser, extras?: { mustChangePassword?: boolean }) {
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
        // Түр нууц үгтэй данс — UI нэвтэрмэгц солихыг анхааруулна.
        mustChangePassword: extras?.mustChangePassword ?? false,
      },
    };
  }
}
