import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Reports & exports (M-20): period summary + Excel-ready CSV downloads. */
@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  async summary(@CurrentUser() user: AuthUser, @Query('days') daysRaw?: number) {
    const days = Math.max(1, Math.min(365, Number(daysRaw) || 30));
    const since = new Date(Date.now() - days * 864e5);

    const [byState, invoiceAgg, payAgg, topCustomers, smsAgg] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['state'],
        where: { tenantId: user.tenantId, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId: user.tenantId, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { amount: true, balance: true },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: { intent: { is: { tenantId: user.tenantId } }, paidAt: { gte: since }, status: 'SUCCEEDED' },
        _count: { _all: true },
        _sum: { gross: true, fee: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['customerId'],
        where: { tenantId: user.tenantId, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 10,
      }),
      this.prisma.usageEvent.aggregate({
        where: { tenantId: user.tenantId, meterCode: 'SMS_SEGMENT_SENT', occurredAt: { gte: since } },
        _sum: { qty: true },
      }),
    ]);

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: topCustomers.map((t) => t.customerId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(customers.map((c) => [c.id, c.name]));

    return {
      days,
      since,
      invoices: { count: invoiceAgg._count._all, amount: invoiceAgg._sum.amount ?? 0, outstanding: invoiceAgg._sum.balance ?? 0 },
      payments: { count: payAgg._count._all, gross: payAgg._sum.gross ?? 0, fee: payAgg._sum.fee ?? 0 },
      smsSegments: smsAgg._sum.qty ?? 0,
      byState: byState.map((s) => ({ state: s.state, count: s._count._all, amount: s._sum.amount ?? 0 })),
      topCustomers: topCustomers.map((t) => ({
        customerId: t.customerId,
        name: nameOf.get(t.customerId) ?? '?',
        invoices: t._count._all,
        amount: t._sum.amount ?? 0,
      })),
    };
  }

  /** CSV export with UTF-8 BOM so Excel opens Cyrillic correctly. */
  @Get('export')
  async export(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('days') daysRaw?: number,
  ) {
    const days = Math.max(1, Math.min(365, Number(daysRaw) || 30));
    const since = new Date(Date.now() - days * 864e5);
    const kind = type === 'payments' ? 'payments' : 'invoices';

    let header: string[];
    let rows: unknown[][];
    if (kind === 'invoices') {
      const invoices = await this.prisma.invoice.findMany({
        where: { tenantId: user.tenantId, createdAt: { gte: since } },
        include: { customer: { select: { name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10_000,
      });
      header = ['number', 'customer', 'phone', 'description', 'amount', 'balance', 'state', 'due_date', 'created_at', 'paid_at'];
      rows = invoices.map((i) => [
        i.number, i.customer.name, i.customer.phone ?? '', i.description, i.amount, i.balance, i.state,
        i.dueDate?.toISOString().slice(0, 10) ?? '', i.createdAt.toISOString(), i.paidAt?.toISOString() ?? '',
      ]);
    } else {
      const payments = await this.prisma.paymentTransaction.findMany({
        where: { intent: { is: { tenantId: user.tenantId } }, paidAt: { gte: since } },
        include: { intent: { select: { provider: true, invoice: { select: { number: true, customer: { select: { name: true } } } } } } },
        orderBy: { paidAt: 'desc' },
        take: 10_000,
      });
      header = ['paid_at', 'invoice', 'customer', 'provider', 'provider_payment_id', 'gross', 'fee', 'net', 'status'];
      rows = payments.map((p) => [
        p.paidAt.toISOString(), p.intent.invoice.number, p.intent.invoice.customer.name,
        p.intent.provider, p.providerPaymentId, p.gross, p.fee, p.net, p.status,
      ]);
    }

    const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="billingservice_${kind}_${days}d.csv"`);
    res.send(csv);
  }
}
