import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';

/** Platform-operator area (screen A-02 subset): ops stats + audit trail. */
@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview() {
    const since30 = new Date(Date.now() - 30 * 864e5);
    const [tenants, users, invoiceAgg, paid30, receiptPending, smsFailed, recentAudit, tenantRows] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.invoice.aggregate({ _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.paymentTransaction.aggregate({
        where: { paidAt: { gte: since30 }, status: 'SUCCEEDED' },
        _count: { _all: true },
        _sum: { gross: true },
      }),
      this.prisma.ebarimtReceipt.count({ where: { state: { in: ['PENDING', 'FAILED'] } } }),
      this.prisma.messageJob.count({ where: { status: 'FAILED' } }),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          name: true,
          kybStatus: true,
          status: true,
          createdAt: true,
          _count: { select: { invoices: true, customers: true, memberships: true } },
        },
      }),
    ]);

    return {
      kpis: {
        tenants,
        users,
        invoices: invoiceAgg._count._all,
        invoicedTotal: invoiceAgg._sum.amount ?? 0,
        payments30d: paid30._count._all,
        collected30d: paid30._sum.gross ?? 0,
        receiptPending,
        smsFailed,
      },
      tenants: tenantRows,
      audit: recentAudit,
    };
  }

  @Get('audit')
  async audit(@Query('take') take?: number, @Query('skip') skip?: number) {
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(take) || 50, 200),
        skip: Number(skip) || 0,
      }),
      this.prisma.auditLog.count(),
    ]);
    return { items, total };
  }
}
