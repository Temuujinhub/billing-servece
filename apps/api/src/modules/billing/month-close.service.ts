import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { MessagingService } from '../messaging/messaging.service';
import { BillingService } from './billing.service';

const SWEEP_MS = 6 * 3600 * 1000; // 6 цаг тутам шалгана (сар хаагдсан эсэх)

/**
 * Сар хаалт: өмнөх сарын хэрэглээг ServiceBill болгож, платформын нэхэмжлэгч
 * tenant-аас (Медиа Профессионал ХХК — админ Pricing хуудсанд тохируулна)
 * харилцагч байгууллага бүрд НӨАТ-тэй ААН (B2B) нэхэмжлэх үүсгэн SMS-ээр
 * илгээнэ. Өөрийн л нэхэмжлэх+SMS урсгал ашиглагдана — төлбөр орж ирэхэд
 * eBarimt нь төлөгч байгууллагын регистрээр B2B хэлбэрээр автоматаар гарна.
 *
 * Идемпотент: ServiceBill unique(tenantId, cycle); нэхэмжлэхгүй үлдсэн
 * (biller тохируулаагүй үеийн) bill дараагийн ажиллагаанд нөхөн нэхэмжлэгдэнэ.
 */
@Injectable()
export class MonthCloseService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MonthCloseService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly invoices: InvoicesService,
    private readonly messaging: MessagingService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.error(e?.message)), SWEEP_MS);
    setTimeout(() => void this.sweep().catch((e) => this.logger.error(e?.message)), 120_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** "2026-08" → УБ цагаар сарын эхлэл/төгсгөл (UTC Date). */
  static cycleBounds(cycle: string): { start: Date; end: Date } {
    const [y, m] = cycle.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1, -8)); // UB = UTC+8
    const end = new Date(Date.UTC(y, m, 1, -8));
    return { start, end };
  }

  /** Өмнөх сарын түлхүүр (УБ цагаар). */
  static previousCycle(now = new Date()): string {
    const ub = new Date(now.getTime() + 8 * 3600 * 1000);
    const prevMid = new Date(Date.UTC(ub.getUTCFullYear(), ub.getUTCMonth() - 1, 15));
    return `${prevMid.getUTCFullYear()}-${String(prevMid.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  async sweep() {
    if (this.running) return;
    this.running = true;
    try {
      await this.closeMonth(MonthCloseService.previousCycle());
    } finally {
      this.running = false;
    }
  }

  /** Мөчлөгийг хаана — байхгүй bill-үүдийг үүсгэж, нэхэмжлэхгүйг нь нэхэмжилнэ. */
  async closeMonth(cycle: string) {
    if (!/^\d{4}-\d{2}$/.test(cycle)) throw new Error(`Буруу мөчлөг: ${cycle}`);
    const { start, end } = MonthCloseService.cycleBounds(cycle);
    if (end.getTime() > Date.now()) {
      throw new Error(`${cycle} мөчлөг дуусаагүй байна — хаах боломжгүй.`);
    }
    const pricing = await this.billing.pricing();
    const billerId = pricing.BILLER_TENANT_ID;
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE', ...(billerId ? { id: { not: billerId } } : {}) },
      select: { id: true, name: true, regNo: true, contactPhone: true, contactEmail: true },
    });

    let created = 0;
    let invoiced = 0;
    for (const tenant of tenants) {
      try {
        let bill = await this.prisma.serviceBill.findUnique({
          where: { tenantId_cycle: { tenantId: tenant.id, cycle } },
        });
        if (!bill) {
          const computed = await this.billing.computeLines(tenant.id, start, end);
          bill = await this.prisma.serviceBill.create({
            data: {
              tenantId: tenant.id,
              cycle,
              lines: computed.lines as any,
              subtotal: computed.subtotal,
              vat: computed.vat,
              total: computed.total,
            },
          });
          if (computed.chargeIds.length > 0) {
            await this.prisma.serviceCharge.updateMany({
              where: { id: { in: computed.chargeIds } },
              data: { billedCycle: cycle },
            });
          }
          created += 1;
        }
        if (bill.total > 0 && !bill.invoiceId && billerId) {
          if (!tenant.contactPhone) {
            this.logger.warn(`Tenant ${tenant.name} утасгүй — ${cycle} нэхэмжлэх хойшлов (Тохиргоо → утас).`);
          } else {
            await this.invoiceBill(billerId, tenant, bill);
            invoiced += 1;
          }
        }
      } catch (e: any) {
        this.logger.warn(`Month-close failed for tenant ${tenant.id} (${cycle}): ${e?.message}`);
      }
    }
    if (created > 0 || invoiced > 0) {
      this.logger.log(`Month-close ${cycle}: ${created} тооцоо үүсэж, ${invoiced} нэхэмжлэх илгээгдлээ.`);
    }
    if (!billerId) {
      this.logger.warn('BILLER_TENANT_ID тохируулаагүй — тооцоонууд нэхэмжлэгдэхгүй хүлээж байна (Admin → Pricing).');
    }
    return { cycle, created, invoiced, billerConfigured: Boolean(billerId) };
  }

  /** Bill → biller tenant дотор бодит нэхэмжлэх (+SMS) үүсгэж холбоно. */
  private async invoiceBill(
    billerId: string,
    tenant: { id: string; name: string; regNo: string | null; contactPhone: string | null; contactEmail: string | null },
    bill: { id: string; cycle: string; total: number },
  ) {
    const invoice = await this.invoices.create(
      {
        userId: 'system:month-close',
        email: 'billing@platform',
        name: 'Platform Billing',
        tenantId: billerId,
        role: 'OWNER' as any,
        isAdmin: false,
      },
      {
        customerName: tenant.name,
        customerPhone: tenant.contactPhone ?? undefined,
        customerEmail: tenant.contactEmail ?? undefined,
        amount: bill.total,
        description: `billingservice.mn үйлчилгээний төлбөр ${bill.cycle} (НӨАТ орсон)`,
        dueDate: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
        send: Boolean(tenant.contactPhone),
      } as any,
      'platform',
    );
    // ААН-ийн (B2B) баримт: төлөгч байгууллагын регистрээр eBarimt гарна.
    if (tenant.regNo) {
      await this.prisma.invoice.update({ where: { id: invoice.id }, data: { payerRegNo: tenant.regNo } });
    }
    await this.prisma.serviceBill.update({
      where: { id: bill.id },
      data: { invoiceId: invoice.id, status: 'INVOICED' },
    });
    await this.messaging.dispatchQueued(billerId);
  }
}
