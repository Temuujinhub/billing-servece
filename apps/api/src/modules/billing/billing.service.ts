import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { monthStart } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Тарифын загвар v2 (2026-08-12 бизнес шийдвэрүүд). Суурь хураамж БАЙХГҮЙ —
 * 4 үйлчилгээ тус бүр өөрийн үнэтэй, бүх хураамжид НӨАТ нэмж тооцно.
 * Админ /admin/pricing-ээс бүх утгыг өөрчилж болно (PlatformSetting 'pricing').
 */
export const PRICING = {
  /** Үйлчилгээ 1 (EXCEL_SMS): нэг нэхэмжлэх ИЛГЭЭЛТИЙН үнэ — segment-ээс үл
   *  хамаарна (~2 segment нийлээд 100₮), eBarimt багтсан. */
  INVOICE_MSG: 100,
  /** Үйлчилгээ 2 (API_SMS): default үнэ — tenant бүр TenantModule.unitPrice-аар
   *  тохиролцооны үнэтэй байж болно (эхний үйлчлүүлэгч 75₮). */
  API_INVOICE_MSG: 100,
  /** Үйлчилгээ 3 (EBARIMT_API): нэг удаагийн интеграцийн хураамж. */
  EBARIMT_API_ONBOARDING: 100_000,
  /** Үйлчилгээ 3: 3 шатлал — сарын баримтын хязгаар + сарын хураамж. */
  EBARIMT_API_TIERS: [
    { upTo: 500 as number | null, fee: 20_000 },
    { upTo: 2000 as number | null, fee: 50_000 },
    { upTo: null as number | null, fee: 100_000 },
  ],
  /** Үйлчилгээ 4 (POS_EBARIMT): тухайн сард идэвхтэй терминал тус бүр.
   *  Баримтын тоон хязгаургүй — төхөөрөмжөөр тоолно. */
  POS_PER_DEVICE: 20_000,
  /** Бүх хураамжид нэмж тооцох НӨАТ (%). */
  VAT_PERCENT: 10,
  /** Платформын өөрийн нэхэмжлэх гаргагч tenant (Медиа Профессионал ХХК) — админ тохируулна. */
  BILLER_TENANT_ID: null as string | null,
};

export type Pricing = typeof PRICING;
export type EbarimtTier = { upTo: number | null; fee: number };

/** 4 үндсэн үйлчилгээ + туслах модулиуд — OWNER асааж/унтрааж болно. */
export const SERVICE_CODES = ['EXCEL_SMS', 'API_SMS', 'EBARIMT_API', 'POS_EBARIMT'] as const;
const TOGGLABLE = [...SERVICE_CODES, 'EBARIMT', 'REMINDER'] as const;

export function vatOf(subtotal: number, vatPercent: number): number {
  return Math.round((subtotal * vatPercent) / 100);
}

/** "2026-08" — тооцооны мөчлөгийн түлхүүр (Улаанбаатарын сараар). */
export function cycleKey(d: Date): string {
  const ulat = new Date(d.getTime() + 8 * 3600 * 1000); // UTC+8
  return `${ulat.getUTCFullYear()}-${String(ulat.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Admin-editable rates (PlatformSetting 'pricing') — код доторх default-той нийлүүлнэ. */
  async pricing(): Promise<Pricing> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: 'pricing' } });
    if (!row) return PRICING;
    const stored = row.value as Partial<Pricing>;
    const tiers =
      Array.isArray(stored.EBARIMT_API_TIERS) && stored.EBARIMT_API_TIERS.length === 3
        ? (stored.EBARIMT_API_TIERS as EbarimtTier[])
        : PRICING.EBARIMT_API_TIERS;
    return { ...PRICING, ...stored, EBARIMT_API_TIERS: tiers };
  }

  /** Шатлалын мэдээлэл (1..3). Буруу дугаарт 1-р шатлал. */
  tierInfo(pricing: Pricing, tier?: number | null): EbarimtTier & { tier: number } {
    const i = tier && tier >= 1 && tier <= pricing.EBARIMT_API_TIERS.length ? tier : 1;
    return { tier: i, ...pricing.EBARIMT_API_TIERS[i - 1] };
  }

  /** Илгээлтийн нэгж үнэ: tenant-тэй тохиролцсон unitPrice > глобал тариф. */
  async unitPriceFor(tenantId: string, code: 'EXCEL_SMS' | 'API_SMS', pricing?: Pricing): Promise<number> {
    const p = pricing ?? (await this.pricing());
    const module = await this.prisma.tenantModule.findUnique({
      where: { tenantId_code: { tenantId, code } },
      select: { unitPrice: true },
    });
    return module?.unitPrice ?? (code === 'API_SMS' ? p.API_INVOICE_MSG : p.INVOICE_MSG);
  }

  /**
   * Тухайн tenant-ийн тухайн мөчлөгийн тооцооны мөрүүд. Сар дундын урьдчилсан
   * тооцоо (overview) болон сар хаах (month-close) хоёулаа ЭНЭ нэг логикоор
   * тоологдоно — хоёр өөр дүн гарах боломжгүй.
   */
  async computeLines(tenantId: string, since: Date, until: Date | null, opts?: { billOneTime?: boolean }) {
    const pricing = await this.pricing();
    const occurredAt = until ? { gte: since, lt: until } : { gte: since };
    const [modules, usage, activeTerminals, charges] = await Promise.all([
      this.prisma.tenantModule.findMany({ where: { tenantId } }),
      this.prisma.usageEvent.groupBy({
        by: ['meterCode', 'serviceCode'],
        where: { tenantId, occurredAt },
        _sum: { qty: true },
      }),
      this.prisma.posTerminal.count({
        where: { tenantId, status: 'ACTIVE', lastSeenAt: until ? { gte: since, lt: until } : { gte: since } },
      }),
      this.prisma.serviceCharge.findMany({ where: { tenantId, billedCycle: null } }),
    ]);
    const meter = (meterCode: string, serviceCode: string) =>
      usage.find((u) => u.meterCode === meterCode && u.serviceCode === serviceCode)?._sum.qty ?? 0;
    const mod = (code: string) => modules.find((m) => m.code === code);

    const excelMsgs = meter('INVOICE_MSG_SENT', 'EXCEL_SMS');
    const apiMsgs = meter('INVOICE_MSG_SENT', 'API_SMS');
    const apiReceipts = meter('RECEIPT_CREATED', 'EBARIMT_API');
    const excelUnit = mod('EXCEL_SMS')?.unitPrice ?? pricing.INVOICE_MSG;
    const apiUnit = mod('API_SMS')?.unitPrice ?? pricing.API_INVOICE_MSG;
    const ebarimtApiOn = Boolean(mod('EBARIMT_API')?.enabled);
    const tier = this.tierInfo(pricing, mod('EBARIMT_API')?.tier);

    const lines: { code: string; label: string; qty: number; unitPrice: number; amount: number }[] = [];
    if (excelMsgs > 0) {
      lines.push({
        code: 'EXCEL_SMS',
        label: 'Нэхэмжлэх илгээлт — Excel/дашбоард (eBarimt багтсан)',
        qty: excelMsgs,
        unitPrice: excelUnit,
        amount: excelMsgs * excelUnit,
      });
    }
    if (apiMsgs > 0) {
      lines.push({
        code: 'API_SMS',
        label: 'Нэхэмжлэх илгээлт — API холболт',
        qty: apiMsgs,
        unitPrice: apiUnit,
        amount: apiMsgs * apiUnit,
      });
    }
    if (ebarimtApiOn) {
      lines.push({
        code: 'EBARIMT_API',
        label: `eBarimt API — шатлал ${tier.tier} (сард ${tier.upTo ? `≤${tier.upTo}` : 'хязгааргүй'} баримт)`,
        qty: 1,
        unitPrice: tier.fee,
        amount: tier.fee,
      });
    }
    if (activeTerminals > 0) {
      lines.push({
        code: 'POS_EBARIMT',
        label: 'POS терминал — идэвхтэй төхөөрөмж',
        qty: activeTerminals,
        unitPrice: pricing.POS_PER_DEVICE,
        amount: activeTerminals * pricing.POS_PER_DEVICE,
      });
    }
    if (opts?.billOneTime !== false) {
      for (const c of charges) {
        lines.push({ code: c.code, label: c.label, qty: 1, unitPrice: c.amount, amount: c.amount });
      }
    }

    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const vat = vatOf(subtotal, pricing.VAT_PERCENT);
    return {
      pricing,
      modules,
      lines,
      subtotal,
      vat,
      total: subtotal + vat,
      chargeIds: charges.map((c) => c.id),
      usage: { excelMsgs, apiMsgs, apiReceipts, activeTerminals, tier },
    };
  }

  async overview(tenantId: string) {
    const since = monthStart();
    const computed = await this.computeLines(tenantId, since, null);
    const [usageMeters, terminals, bills] = await Promise.all([
      this.prisma.usageEvent.groupBy({
        by: ['meterCode'],
        where: { tenantId, occurredAt: { gte: since } },
        _sum: { qty: true },
      }),
      this.prisma.posTerminal.findMany({ where: { tenantId }, orderBy: { lastSeenAt: 'desc' }, take: 50 }),
      this.prisma.serviceBill.findMany({ where: { tenantId }, orderBy: { cycle: 'desc' }, take: 12 }),
    ]);
    const meter = (code: string) => usageMeters.find((u) => u.meterCode === code)?._sum.qty ?? 0;
    return {
      cycleStart: since,
      modules: computed.modules,
      pricing: {
        INVOICE_MSG: computed.pricing.INVOICE_MSG,
        API_INVOICE_MSG: computed.pricing.API_INVOICE_MSG,
        EBARIMT_API_ONBOARDING: computed.pricing.EBARIMT_API_ONBOARDING,
        EBARIMT_API_TIERS: computed.pricing.EBARIMT_API_TIERS,
        POS_PER_DEVICE: computed.pricing.POS_PER_DEVICE,
        VAT_PERCENT: computed.pricing.VAT_PERCENT,
      },
      usage: {
        invoiceMsgsExcel: computed.usage.excelMsgs,
        invoiceMsgsApi: computed.usage.apiMsgs,
        apiReceipts: computed.usage.apiReceipts,
        apiReceiptLimit: computed.usage.tier.upTo,
        activeTerminals: computed.usage.activeTerminals,
        smsSegments: meter('SMS_SEGMENT_SENT'),
        receiptsCreated: meter('RECEIPT_CREATED'),
        invoicesCreated: meter('INVOICE_CREATED'),
        paymentsSucceeded: meter('PAYMENT_SUCCEEDED'),
      },
      terminals,
      bills,
      estimate: {
        lines: computed.lines,
        subtotal: computed.subtotal,
        vat: computed.vat,
        total: computed.total,
        note: 'Урьдчилсан тооцоо — сар хаахад НӨАТ-тэй нэхэмжлэх SMS-ээр ирнэ.',
      },
    };
  }

  async toggleModule(user: AuthUser, code: string, enabled: boolean, quantity?: number, tier?: number) {
    if (!TOGGLABLE.includes(code as any)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'UNKNOWN_MODULE', 'Ийм үйлчилгээ алга.', `Unknown module ${code}.`);
    }
    const pricing = await this.pricing();
    if (tier !== undefined && (tier < 1 || tier > pricing.EBARIMT_API_TIERS.length)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'BAD_TIER', 'Шатлал 1–3 байна.', 'Tier must be 1..3.');
    }
    const module = await this.prisma.tenantModule.upsert({
      where: { tenantId_code: { tenantId: user.tenantId, code } },
      create: {
        tenantId: user.tenantId,
        code,
        enabled,
        quantity: quantity ?? (enabled ? 1 : 0),
        tier: code === 'EBARIMT_API' ? (tier ?? 1) : tier,
      },
      update: { enabled, quantity: quantity ?? undefined, tier: tier ?? undefined },
    });
    // Үйлчилгээ 3-ыг анх идэвхжүүлэхэд нэг удаагийн интеграцийн хураамж бүртгэнэ.
    if (code === 'EBARIMT_API' && enabled) {
      await this.ensureOnboardingCharge(user.tenantId, pricing);
    }
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.userId,
        actorEmail: user.email,
        action: enabled ? 'module.enabled' : 'module.disabled',
        targetType: 'module',
        targetId: code,
        meta: { quantity: module.quantity, tier: module.tier },
      },
    });
    return module;
  }

  /** EBARIMT_API onboarding хураамж — tenant бүрд нэг л удаа. */
  async ensureOnboardingCharge(tenantId: string, pricing?: Pricing) {
    const p = pricing ?? (await this.pricing());
    if (p.EBARIMT_API_ONBOARDING <= 0) return;
    const exists = await this.prisma.serviceCharge.findFirst({
      where: { tenantId, code: 'EBARIMT_API_ONBOARDING' },
    });
    if (!exists) {
      await this.prisma.serviceCharge.create({
        data: {
          tenantId,
          code: 'EBARIMT_API_ONBOARDING',
          label: 'eBarimt API интеграцийн хураамж (нэг удаа)',
          amount: p.EBARIMT_API_ONBOARDING,
        },
      });
    }
  }

  /** Үйлчилгээ 3-ын сарын хязгаар: давсан бол алдаа шиднэ (429). */
  async assertReceiptQuota(tenantId: string) {
    const pricing = await this.pricing();
    const module = await this.prisma.tenantModule.findUnique({
      where: { tenantId_code: { tenantId, code: 'EBARIMT_API' } },
    });
    const tier = this.tierInfo(pricing, module?.tier);
    if (tier.upTo == null) return;
    const used = await this.prisma.usageEvent.aggregate({
      where: { tenantId, meterCode: 'RECEIPT_CREATED', serviceCode: 'EBARIMT_API', occurredAt: { gte: monthStart() } },
      _sum: { qty: true },
    });
    if ((used._sum.qty ?? 0) >= tier.upTo) {
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'RECEIPT_QUOTA_EXCEEDED',
        `Сарын eBarimt хязгаар (${tier.upTo}) дүүрсэн — шатлалаа ахиулна уу (Billing → eBarimt API).`,
        `Monthly receipt quota (${tier.upTo}) reached — upgrade your tier.`,
      );
    }
  }

  // ------------------------------------------------------------ POS терминал

  terminals(tenantId: string) {
    return this.prisma.posTerminal.findMany({ where: { tenantId }, orderBy: { lastSeenAt: 'desc' } });
  }

  async setTerminalStatus(user: AuthUser, terminalId: string, status: 'ACTIVE' | 'BLOCKED') {
    const updated = await this.prisma.posTerminal.updateMany({
      where: { id: terminalId, tenantId: user.tenantId },
      data: { status },
    });
    if (updated.count === 0) {
      throw apiError(HttpStatus.NOT_FOUND, 'TERMINAL_NOT_FOUND', 'Терминал олдсонгүй.', 'Terminal not found.');
    }
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.userId,
        actorEmail: user.email,
        action: status === 'BLOCKED' ? 'pos.terminal.blocked' : 'pos.terminal.activated',
        targetType: 'posTerminal',
        targetId: terminalId,
      },
    });
    return { ok: true };
  }

  /** POS баримт бүрд: терминалыг таньж бүртгэнэ/шинэчилнэ. BLOCKED бол алдаа. */
  async touchTerminal(tenantId: string, deviceId: string, name?: string) {
    const terminal = await this.prisma.posTerminal.upsert({
      where: { tenantId_deviceId: { tenantId, deviceId } },
      create: { tenantId, deviceId, name, lastSeenAt: new Date() },
      update: { lastSeenAt: new Date(), name: name ?? undefined, receiptCount: { increment: 1 } },
    });
    if (terminal.status === 'BLOCKED') {
      throw apiError(HttpStatus.FORBIDDEN, 'TERMINAL_BLOCKED', 'Энэ терминал блоклогдсон байна.', 'This terminal is blocked.');
    }
    return terminal;
  }

  bills(tenantId: string) {
    return this.prisma.serviceBill.findMany({ where: { tenantId }, orderBy: { cycle: 'desc' }, take: 24 });
  }
}
