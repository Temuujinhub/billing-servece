import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { monthStart } from '../../common/utils';

/** Dashboard aggregates (screen M-04). Volumes are small enough in the MVP to
 *  aggregate in SQL via Prisma; heavy rollups move to materialized views later. */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(tenantId: string) {
    const since30 = new Date(Date.now() - 30 * 864e5);
    const cycleStart = monthStart();

    const [stateGroups, collectedMonth, collected30, outstandingAgg, recentInvoices, receiptPending, txLast30, smsMonth] =
      await Promise.all([
        this.prisma.invoice.groupBy({
          by: ['state'],
          where: { tenantId },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        this.prisma.paymentTransaction.aggregate({
          where: { intent: { is: { tenantId } }, paidAt: { gte: cycleStart }, status: 'SUCCEEDED' },
          _sum: { gross: true },
          _count: { _all: true },
        }),
        this.prisma.paymentTransaction.aggregate({
          where: { intent: { is: { tenantId } }, paidAt: { gte: since30 }, status: 'SUCCEEDED' },
          _sum: { gross: true },
        }),
        this.prisma.invoice.aggregate({
          where: { tenantId, state: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] } },
          _sum: { balance: true },
          _count: { _all: true },
        }),
        this.prisma.invoice.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: { customer: { select: { name: true } } },
        }),
        this.prisma.ebarimtReceipt.count({ where: { tenantId, state: { in: ['PENDING', 'FAILED'] } } }),
        this.prisma.paymentTransaction.findMany({
          where: { intent: { is: { tenantId } }, paidAt: { gte: since30 }, status: 'SUCCEEDED' },
          select: { gross: true, paidAt: true },
        }),
        this.prisma.usageEvent.aggregate({
          where: { tenantId, meterCode: 'SMS_SEGMENT_SENT', occurredAt: { gte: cycleStart } },
          _sum: { qty: true },
        }),
      ]);

    // 30-day daily collection series for the area chart.
    const series: { date: string; amount: number }[] = [];
    const byDay = new Map<string, number>();
    for (const t of txLast30) {
      const key = t.paidAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + t.gross);
    }
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      series.push({ date: d, amount: byDay.get(d) ?? 0 });
    }

    const stateOf = (s: string) => stateGroups.find((g) => g.state === s);
    const totalInvoices = stateGroups.reduce((n, g) => n + g._count._all, 0);
    const paidCount = stateOf('PAID')?._count._all ?? 0;
    const sentLike = ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE', 'PAID']
      .map((s) => stateOf(s)?._count._all ?? 0)
      .reduce((a, b) => a + b, 0);

    return {
      kpis: {
        collectedThisMonth: collectedMonth._sum.gross ?? 0,
        paymentsThisMonth: collectedMonth._count._all ?? 0,
        collected30d: collected30._sum.gross ?? 0,
        outstandingBalance: outstandingAgg._sum.balance ?? 0,
        outstandingCount: outstandingAgg._count._all ?? 0,
        paymentRate: sentLike > 0 ? Math.round((paidCount / sentLike) * 100) : 0,
        receiptPending,
        smsSegmentsThisMonth: smsMonth._sum.qty ?? 0,
      },
      stateSplit: stateGroups.map((g) => ({ state: g.state, count: g._count._all, amount: g._sum.amount ?? 0 })),
      series,
      recentInvoices: recentInvoices.map((i) => ({
        id: i.id,
        number: i.number,
        customerName: i.customer.name,
        amount: i.amount,
        balance: i.balance,
        state: i.state,
        dueDate: i.dueDate,
        createdAt: i.createdAt,
      })),
      totalInvoices,
    };
  }
}
