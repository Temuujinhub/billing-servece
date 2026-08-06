import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationKind, Prisma } from '@prisma/client';
import { apiError } from '../../common/filters/http-exception.filter';
import { AuthUser } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { EMAIL_PORT, EmailPort } from '../providers/email.port';

/**
 * Integration onboarding requests. Bonum болон LIME талд шинэ мерчантыг
 * автоматаар бүртгэх API одоогоор БАЙХГҮЙ тул урсгал нь хагас гар ажиллагаатай:
 *
 *   tenant OWNER хүсэлт илгээнэ (анкет бүрэн байх шаардлагатай)
 *     → бид Bonum/LIME рүү ИМЭЙЛ илгээнэ (мерчант нэмэх хүсэлт)
 *       → нөгөө тал бүртгэж хариу ирүүлмэгц platform admin APPROVED болгоно
 *         (EBARIMT approve үед EBARIMT модуль автоматаар идэвхжинэ)
 *
 * Анкетын үнэн зөв, ГҮЙЦЭД байдал энд хатуу шалгагдана — дутуу мэдээлэлтэй
 * хүсэлт огт үүсэхгүй (Bonum данс холбох, ТЕГ бүртгэлд 2 талдаа зөв мэдээлэл
 * өгөх нь онбордингийн тулгуур шаардлага).
 */
@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_PORT) private readonly email: EmailPort,
  ) {}

  // ------------------------------------------------------------- validation

  /** Танил алдааны формат: аль талбар дутуу байгааг монголоор нэрлэнэ. */
  private requireComplete(kind: IntegrationKind, tenant: any) {
    const missing: string[] = [];
    const need = (value: unknown, label: string) => {
      if (!value || !String(value).trim()) missing.push(label);
    };
    need(tenant.name, 'Байгууллагын нэр');
    need(tenant.regNo, 'Регистрийн дугаар');
    need(tenant.address, 'Хаяг');
    need(tenant.contactPhone, 'Утас');
    need(tenant.contactEmail, 'Имэйл');
    if (kind === 'BONUM') {
      need(tenant.bankName, 'Банк');
      need(tenant.bankAccountNo, 'Дансны дугаар');
      need(tenant.bankAccountName, 'Дансны нэр');
    }
    if (missing.length > 0) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'ANKET_INCOMPLETE',
        `Дараах мэдээлэл дутуу байна: ${missing.join(', ')}. Тохиргоо хуудсанд гүйцээж бөглөнө үү.`,
        `Missing required fields: ${missing.join(', ')}`,
      );
    }
  }

  /** Анкетын snapshot — хүсэлт илгээсэн агшны мэдээлэл өөрчлөгдөшгүй үлдэнэ. */
  private snapshot(kind: IntegrationKind, tenant: any): Prisma.JsonObject {
    return {
      kind,
      name: tenant.name,
      regNo: tenant.regNo,
      address: tenant.address,
      contactPhone: tenant.contactPhone,
      contactEmail: tenant.contactEmail,
      ...(kind === 'BONUM'
        ? {
            bankName: tenant.bankName,
            bankAccountNo: tenant.bankAccountNo,
            bankAccountName: tenant.bankAccountName,
          }
        : {
            ebarimtMerchantTin: tenant.ebarimtMerchantTin,
            ebarimtPosNo: tenant.ebarimtPosNo,
            ebarimtBranchNo: tenant.ebarimtBranchNo,
            ebarimtDistrictCode: tenant.ebarimtDistrictCode,
          }),
    };
  }

  // ------------------------------------------------------------------ email

  private buildEmail(kind: IntegrationKind, payload: any): { to: string; subject: string; text: string } {
    const publicUrl = (this.config.get<string>('PUBLIC_URL') ?? '').replace(/\/$/, '');
    const lines = [
      'Сайн байна уу,',
      '',
      kind === 'BONUM'
        ? 'billingservice.mn платформоор дамжуулан төлбөр хүлээн авах дараах байгууллагад Bonum Gateway мерчант бүртгэл (терминал) нээж өгнө үү:'
        : 'billingservice.mn платформын дараах шинэ байгууллагыг eBarimt POS API instance дээр (LIME холболт) merchant-аар нэмж бүртгэж өгнө үү:',
      '',
      `  Байгууллагын нэр:  ${payload.name}`,
      `  Регистр:           ${payload.regNo}`,
      `  Хаяг:              ${payload.address}`,
      `  Утас:              ${payload.contactPhone}`,
      `  Имэйл:             ${payload.contactEmail}`,
    ];
    if (kind === 'BONUM') {
      lines.push(
        `  Банк:              ${payload.bankName}`,
        `  Дансны дугаар:     ${payload.bankAccountNo}`,
        `  Дансны нэр:        ${payload.bankAccountName}`,
        '',
        `WEBHOOK URL (терминалд бүртгэнэ үү): ${publicUrl}/api/v1/webhooks/bonum/callback`,
        '',
        'Терминал үүссэний дараа Terminal ID, Secret Key, MERCHANT_CHECKSUM_KEY-г энэ имэйлээр эргүүлэн ирүүлнэ үү.',
      );
    } else {
      lines.push(
        ...(payload.ebarimtMerchantTin ? [`  Merchant TIN:      ${payload.ebarimtMerchantTin}`] : []),
        '',
        'Байгууллага ТЕГ-т өөрийн POS-оор бүртгүүлсэн байх шаардлагатай тул',
        'бүртгэл хийгдмэгц олгогдсон merchantTin + posNo-г эргүүлэн ирүүлнэ үү.',
      );
    }
    lines.push('', 'Баярлалаа.', '', 'billingservice.mn — Media Professional LLC');

    const to =
      kind === 'BONUM'
        ? (this.config.get<string>('ONBOARDING_BONUM_EMAIL') ?? '')
        : (this.config.get<string>('ONBOARDING_LIME_EMAIL') ?? '');
    if (!to) {
      throw new Error(`Onboarding email recipient is not configured (${kind === 'BONUM' ? 'ONBOARDING_BONUM_EMAIL' : 'ONBOARDING_LIME_EMAIL'})`);
    }
    return {
      to,
      subject: `[billingservice.mn] Шинэ мерчант бүртгүүлэх хүсэлт — ${payload.name}`,
      text: lines.join('\n'),
    };
  }

  /** Имэйлийг илгээж, үр дүнг хүсэлт дээр тэмдэглэнэ. Never throws. */
  private async dispatchEmail(requestId: string): Promise<void> {
    const request = await this.prisma.integrationRequest.findUniqueOrThrow({ where: { id: requestId } });
    try {
      const mail = this.buildEmail(request.kind, request.payload as any);
      await this.email.send(mail);
      await this.prisma.integrationRequest.update({
        where: { id: requestId },
        data: { status: 'EMAIL_SENT', emailedAt: new Date(), error: null },
      });
    } catch (e: any) {
      const message = String(e?.message ?? e).slice(0, 500);
      await this.prisma.integrationRequest.update({
        where: { id: requestId },
        data: { error: message },
      });
      this.logger.warn(`Onboarding email failed for request ${requestId}: ${message}`);
    }
  }

  // ----------------------------------------------------------- tenant side

  /** OWNER submits a request; the onboarding email goes out immediately. */
  async submit(user: AuthUser, kind: IntegrationKind) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    this.requireComplete(kind, tenant);

    // Нэг төрлөөр нэг л нээлттэй хүсэлт: REJECTED дараа дахин илгээж болно.
    const open = await this.prisma.integrationRequest.findFirst({
      where: { tenantId: user.tenantId, kind, status: { in: ['SUBMITTED', 'EMAIL_SENT', 'APPROVED'] } },
    });
    if (open) {
      const already =
        open.status === 'APPROVED'
          ? 'Энэ интеграц аль хэдийн баталгаажсан байна.'
          : 'Энэ интеграцын хүсэлт аль хэдийн илгээгдсэн, хянагдаж байна.';
      throw apiError(HttpStatus.CONFLICT, 'REQUEST_EXISTS', already, `An open ${kind} request already exists.`);
    }

    const request = await this.prisma.integrationRequest.create({
      data: {
        tenantId: user.tenantId,
        kind,
        payload: this.snapshot(kind, tenant),
        createdById: user.userId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.userId,
        actorEmail: user.email,
        action: 'integration.request_submitted',
        targetType: 'integration_request',
        targetId: request.id,
        meta: { kind },
      },
    });

    await this.dispatchEmail(request.id);
    return this.prisma.integrationRequest.findUniqueOrThrow({ where: { id: request.id } });
  }

  /** Tenant's own requests, newest first. */
  async listMine(tenantId: string) {
    const items = await this.prisma.integrationRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { items };
  }

  // ------------------------------------------------------------ admin side

  async listAll(status?: string) {
    const where: Prisma.IntegrationRequestWhereInput = status ? { status: status as any } : {};
    const items = await this.prisma.integrationRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { tenant: { select: { id: true, name: true, regNo: true, contactEmail: true, contactPhone: true } } },
    });
    return { items };
  }

  async resendEmail(admin: AuthUser, requestId: string) {
    const request = await this.prisma.integrationRequest.findUnique({ where: { id: requestId } });
    if (!request) throw apiError(HttpStatus.NOT_FOUND, 'REQUEST_NOT_FOUND', 'Хүсэлт олдсонгүй.', 'Request not found.');
    if (['APPROVED', 'REJECTED'].includes(request.status)) {
      throw apiError(HttpStatus.CONFLICT, 'REQUEST_CLOSED', 'Шийдвэрлэгдсэн хүсэлтэд имэйл дахин илгээхгүй.', 'Request is already decided.');
    }
    await this.dispatchEmail(requestId);
    await this.prisma.auditLog.create({
      data: {
        tenantId: request.tenantId,
        actorId: admin.userId,
        actorEmail: admin.email,
        action: 'integration.email_resent',
        targetType: 'integration_request',
        targetId: requestId,
      },
    });
    return this.prisma.integrationRequest.findUniqueOrThrow({ where: { id: requestId } });
  }

  /**
   * Bonum/LIME талаас бүртгэл хийгдсэн (эсвэл татгалзсан) хариу ирмэгц админ
   * шийднэ. EBARIMT APPROVED үед EBARIMT модуль автоматаар идэвхжинэ — модуль
   * унтраатай үед хийгдсэн төлбөрт баримт үүсдэггүй (NOT_REQUIRED) тул энэ
   * алхам мартагдвал баримт алдагдана.
   */
  async decide(admin: AuthUser, requestId: string, approved: boolean, note?: string) {
    const request = await this.prisma.integrationRequest.findUnique({ where: { id: requestId } });
    if (!request) throw apiError(HttpStatus.NOT_FOUND, 'REQUEST_NOT_FOUND', 'Хүсэлт олдсонгүй.', 'Request not found.');
    if (['APPROVED', 'REJECTED'].includes(request.status)) {
      throw apiError(HttpStatus.CONFLICT, 'REQUEST_CLOSED', 'Хүсэлт аль хэдийн шийдвэрлэгдсэн.', 'Request is already decided.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.integrationRequest.update({
        where: { id: requestId },
        data: { status: approved ? 'APPROVED' : 'REJECTED', note: note?.slice(0, 500), decidedAt: new Date() },
      });
      if (approved && request.kind === 'EBARIMT') {
        await tx.tenantModule.upsert({
          where: { tenantId_code: { tenantId: request.tenantId, code: 'EBARIMT' } },
          create: { tenantId: request.tenantId, code: 'EBARIMT', enabled: true },
          update: { enabled: true },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: admin.userId,
          actorEmail: admin.email,
          action: approved ? 'integration.request_approved' : 'integration.request_rejected',
          targetType: 'integration_request',
          targetId: requestId,
          meta: { kind: request.kind, note: note ?? null },
        },
      });
    });
    return this.prisma.integrationRequest.findUniqueOrThrow({ where: { id: requestId } });
  }
}
