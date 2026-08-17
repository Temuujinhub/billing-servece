import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Provisions the platform-admin account from environment variables so the
 * password never touches the (public) repository:
 *
 *   ADMIN_BOOTSTRAP_EMAIL=stemuujin@gmail.com
 *   ADMIN_BOOTSTRAP_PASSWORD=********
 *
 * If the user is missing it is created (own tenant + OWNER membership +
 * platformAdmin). If it already exists only the admin flag is ensured — the
 * password is never overwritten silently. Runs once per boot; idempotent.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = this.config.get<string>('ADMIN_BOOTSTRAP_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_BOOTSTRAP_PASSWORD');
    if (!email) return;

    try {
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing) {
        if (!existing.platformAdmin) {
          await this.prisma.user.update({ where: { id: existing.id }, data: { platformAdmin: true } });
          this.logger.log(`Granted platform admin to existing user ${email}`);
        }
        return;
      }
      if (!password || password.length < 8) {
        this.logger.warn(`ADMIN_BOOTSTRAP_EMAIL is set but ADMIN_BOOTSTRAP_PASSWORD is missing/short — skipping create`);
        return;
      }
      const passwordHash = await bcrypt.hash(password, 12);
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          // mustChangePassword: env-ээр ирсэн нууц үг түр гэж үзнэ — админ
          // анх нэвтрэхэд UI сольж авахыг шаардана (B-54).
          data: { email, name: 'Платформын админ', passwordHash, platformAdmin: true, mustChangePassword: true },
        });
        const tenant = await tx.tenant.create({
          data: {
            name: 'MASTR Systems',
            type: 'ORGANIZATION',
            kybStatus: 'APPROVED',
            contactEmail: email,
            invoiceSeq: { create: {} },
            modules: {
              create: [
                { code: 'EXCEL_SMS', enabled: true },
                { code: 'API_SMS', enabled: false, quantity: 0 },
                { code: 'EBARIMT_API', enabled: false, quantity: 0, tier: 1 },
                { code: 'POS_EBARIMT', enabled: false, quantity: 0 },
                { code: 'EBARIMT', enabled: false },
                { code: 'REMINDER', enabled: false },
              ],
            },
          },
        });
        await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'OWNER' } });
        await tx.auditLog.create({
          data: { tenantId: tenant.id, actorEmail: 'system', action: 'admin.bootstrapped', targetType: 'user', targetId: user.id },
        });
      });
      this.logger.log(`Platform admin account created for ${email}`);
    } catch (e: any) {
      this.logger.error(`Admin bootstrap failed: ${e?.message}`);
    }
  }
}
