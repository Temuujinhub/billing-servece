import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { monthStart } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Platform billing (PRD §4.1) — the merchant-facing cost preview:
 *   base 20,000₮ + SMS segments × 25₮ + eBarimt 20,000₮ + POS × 20,000₮.
 * These are the client's initial business assumptions; rates live in one
 * place so contract-confirmed prices are a one-line change.
 */
export const PRICING = {
  BASE_FEE: 20_000,
  SMS_PER_SEGMENT: 25,
  EBARIMT_CONNECTION: 20_000,
  POS_PER_DEVICE: 20_000,
} as const;

const TOGGLABLE = ['SMS', 'EBARIMT', 'POS', 'REMINDER'] as const;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string) {
    const since = monthStart();
    const [modules, usage] = await Promise.all([
      this.prisma.tenantModule.findMany({ where: { tenantId }, orderBy: { code: 'asc' } }),
      this.prisma.usageEvent.groupBy({
        by: ['meterCode'],
        where: { tenantId, occurredAt: { gte: since } },
        _sum: { qty: true },
      }),
    ]);

    const meter = (code: string) => usage.find((u) => u.meterCode === code)?._sum.qty ?? 0;
    const smsSegments = meter('SMS_SEGMENT_SENT');
    const moduleOn = (code: string) => modules.find((m) => m.code === code)?.enabled ?? false;
    const posCount = moduleOn('POS') ? (modules.find((m) => m.code === 'POS')?.quantity ?? 0) : 0;

    const lines = [
      { code: 'BASE', label: 'Суурь хураамж', qty: 1, unitPrice: PRICING.BASE_FEE, amount: PRICING.BASE_FEE },
      {
        code: 'SMS',
        label: 'SMS (segment)',
        qty: smsSegments,
        unitPrice: PRICING.SMS_PER_SEGMENT,
        amount: smsSegments * PRICING.SMS_PER_SEGMENT,
      },
      ...(moduleOn('EBARIMT')
        ? [{ code: 'EBARIMT', label: 'eBarimt холболт', qty: 1, unitPrice: PRICING.EBARIMT_CONNECTION, amount: PRICING.EBARIMT_CONNECTION }]
        : []),
      ...(posCount > 0
        ? [{ code: 'POS', label: 'POS төхөөрөмж', qty: posCount, unitPrice: PRICING.POS_PER_DEVICE, amount: posCount * PRICING.POS_PER_DEVICE }]
        : []),
    ];

    return {
      cycleStart: since,
      modules,
      usage: {
        smsSegments,
        receiptsCreated: meter('RECEIPT_CREATED'),
        invoicesCreated: meter('INVOICE_CREATED'),
        paymentsSucceeded: meter('PAYMENT_SUCCEEDED'),
      },
      estimate: {
        lines,
        total: lines.reduce((s, l) => s + l.amount, 0),
        note: 'Урьдчилсан тооцоо — эцсийн үнэ provider гэрээ, НӨАТ-аар баталгаажина.',
      },
    };
  }

  async toggleModule(user: AuthUser, code: string, enabled: boolean, quantity?: number) {
    if (!TOGGLABLE.includes(code as any)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'UNKNOWN_MODULE', 'Ийм модуль алга.', `Unknown module ${code}.`);
    }
    const module = await this.prisma.tenantModule.upsert({
      where: { tenantId_code: { tenantId: user.tenantId, code } },
      create: { tenantId: user.tenantId, code, enabled, quantity: quantity ?? (enabled ? 1 : 0) },
      update: { enabled, quantity: quantity ?? undefined },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.userId,
        actorEmail: user.email,
        action: enabled ? 'module.enabled' : 'module.disabled',
        targetType: 'module',
        targetId: code,
        meta: { quantity: module.quantity },
      },
    });
    return module;
  }
}
