import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly, AuthUser, CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { MonthCloseService } from '../billing/month-close.service';
import { ProviderConfigService } from '../providers/provider-config.service';
import { AdminService } from './admin.service';

/** Best-effort HTTP probe: status + latency + a short body sample, never throws. */
async function probe(url: string, init?: RequestInit) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    const body = (await res.text().catch(() => '')).slice(0, 140);
    return { reachable: true, httpStatus: res.status, latencyMs: Date.now() - t0, sample: body };
  } catch (e: any) {
    return { reachable: false, httpStatus: null, latencyMs: Date.now() - t0, sample: String(e?.message ?? e).slice(0, 140) };
  }
}

/**
 * Platform-operator console (PRD A-02..A-22). Every route requires the
 * platformAdmin flag; every mutating action lands in the audit log.
 */
@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly providerConfigs: ProviderConfigService,
    private readonly monthClose: MonthCloseService,
  ) {}

  // ---------------------------------------------- System health (ops runbook)

  /**
   * One-stop dependency check: DB, provider APIs, ebarimt registry, queues,
   * and the platform-admin roster — everything an operator needs to see at
   * a glance when "something is off".
   */
  @Get('health/system')
  async systemHealth(@CurrentUser() user: AuthUser) {
    const dbT0 = Date.now();
    const [tenants, users, invoices, smsQueued, smsFailed24h, receiptsPending, intentsProcessing, reminderTenants, admins] =
      await Promise.all([
        this.prisma.tenant.count(),
        this.prisma.user.count(),
        this.prisma.invoice.count(),
        this.prisma.messageJob.count({ where: { status: 'QUEUED' } }),
        this.prisma.messageJob.count({ where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 864e5) } } }),
        this.prisma.ebarimtReceipt.count({ where: { state: { in: ['PENDING', 'FAILED'] } } }),
        this.prisma.paymentIntent.count({ where: { state: { in: ['PENDING', 'PROCESSING'] } } }),
        this.prisma.tenantModule.count({ where: { code: 'REMINDER', enabled: true } }),
        this.prisma.user.findMany({ where: { platformAdmin: true }, select: { email: true, name: true, createdAt: true } }),
      ]);
    const dbLatencyMs = Date.now() - dbT0;

    const [qpay, callpro, bonum, ebarimtTin, ebarimtInfo] = await Promise.all([
      this.providerConfigs.test(user.tenantId, 'QPAY').catch((e) => ({ ok: false, httpStatus: null, message_mn: String(e?.message ?? e) })),
      this.providerConfigs.test(user.tenantId, 'CALLPRO').catch((e) => ({ ok: false, httpStatus: null, message_mn: String(e?.message ?? e) })),
      this.providerConfigs.test(user.tenantId, 'BONUM').catch((e) => ({ ok: false, httpStatus: null, message_mn: String(e?.message ?? e) })),
      probe('https://api.ebarimt.mn/api/info/check/getTinInfo?regNo=2657457'),
      probe('https://api.ebarimt.mn/api/info/check/getInfo?regNo=2657457'),
    ]);

    return {
      checkedAt: new Date(),
      db: { ok: true, latencyMs: dbLatencyMs, tenants, users, invoices },
      queues: { smsQueued, smsFailed24h, receiptsPending, intentsProcessing, reminderTenants },
      providers: { qpay, callpro, bonum },
      ebarimt: { tinLookup: ebarimtTin, infoLookup: ebarimtInfo },
      admins,
    };
  }

  // ------------------------------------------------------- A-02 overview

  @Get('overview')
  async overview() {
    const since30 = new Date(Date.now() - 30 * 864e5);
    const [tenants, users, invoiceAgg, paid30, receiptPending, smsFailed, openIncidents, recentAudit] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.invoice.aggregate({ _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.paymentTransaction.aggregate({
        where: { paidAt: { gte: since30 }, status: 'SUCCEEDED' },
        _count: { _all: true },
        _sum: { gross: true },
      }),
      this.prisma.ebarimtReceipt.count({ where: { state: { in: ['PENDING', 'FAILED', 'CANCEL_PENDING'] } } }),
      this.prisma.messageJob.count({ where: { status: 'FAILED' } }),
      this.prisma.incident.count({ where: { status: { not: 'RESOLVED' } } }),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
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
        openIncidents,
      },
      audit: recentAudit,
    };
  }

  // ------------------------------------------- A-03..A-06 merchants & KYB

  @Get('merchants')
  merchants(@Query('search') search?: string, @Query('kyb') kyb?: string, @Query('take') take?: number, @Query('skip') skip?: number) {
    return this.admin.merchants(search, kyb, Number(take) || 50, Number(skip) || 0);
  }

  @Get('merchants/:id')
  merchant(@Param('id') id: string) {
    return this.admin.merchant360(id);
  }

  @HttpCode(200)
  @Post('merchants/:id/kyb')
  kyb(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { action: 'APPROVE' | 'REJECT' | 'NEEDS_INFO' | 'UNDER_REVIEW' | 'SUSPEND' | 'ACTIVATE'; reason?: string },
  ) {
    return this.admin.kybAction(user, id, body.action, body.reason);
  }

  @HttpCode(200)
  @Post('merchants/:id/modules/:code')
  setModule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('code') code: string,
    @Body() body: { enabled: boolean; quantity?: number },
  ) {
    return this.admin.setTenantModule(user, id, code.toUpperCase(), Boolean(body.enabled), body.quantity);
  }

  /** Tenant-тэй тохиролцсон нэгж үнэ (ж: API илгээлт 75₮) / eBarimt API шатлал. */
  @HttpCode(200)
  @Put('merchants/:id/pricing/:code')
  setTenantPricing(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('code') code: string,
    @Body() body: { unitPrice?: number | null; tier?: number | null },
  ) {
    return this.admin.setTenantPricing(user, id, code.toUpperCase(), body.unitPrice ?? null, body.tier ?? null);
  }

  // -------------------------------------------- A-07..A-09 transactions

  @Get('transactions')
  transactions(
    @Query('state') state?: string,
    @Query('provider') provider?: string,
    @Query('search') search?: string,
    @Query('take') take?: number,
    @Query('skip') skip?: number,
  ) {
    return this.admin.transactions({ state, provider, search, take: Number(take) || 50, skip: Number(skip) || 0 });
  }

  @Get('transactions/:intentId')
  transaction(@Param('intentId') intentId: string) {
    return this.admin.transaction(intentId);
  }

  @HttpCode(200)
  @Post('transactions/:intentId/recheck')
  recheck(@CurrentUser() user: AuthUser, @Param('intentId') intentId: string) {
    return this.admin.recheck(user, intentId);
  }

  @HttpCode(200)
  @Post('transactions/tx/:transactionId/refund')
  refund(@CurrentUser() user: AuthUser, @Param('transactionId') transactionId: string, @Body('reason') reason: string) {
    return this.admin.refund(user, transactionId, reason);
  }

  // ------------------------------------------ A-10/A-11/A-18 ops queues

  @Get('receipts')
  receipts(@Query('state') state?: string) {
    return this.admin.receiptQueue(state);
  }

  @HttpCode(200)
  @Post('receipts/:id/retry')
  retryReceipt(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.retryReceipt(user, id);
  }

  @Get('messages')
  messages(@Query('status') status?: string) {
    return this.admin.messageQueue(status);
  }

  @HttpCode(200)
  @Post('messages/:id/retry')
  retryMessage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.retryMessage(user, id);
  }

  @Get('event-ops')
  eventOps() {
    return this.admin.eventOps();
  }

  // ---------------------------------------------- A-12/13 reconciliation

  @Get('reconciliation')
  reconciliation() {
    return this.admin.reconciliationRuns();
  }

  @HttpCode(200)
  @Post('reconciliation/run')
  runReconciliation(@CurrentUser() user: AuthUser, @Body('days') days?: number) {
    return this.admin.runReconciliation(user, Number(days) || 7);
  }

  // ------------------------------------------------ A-14 provider health

  @Get('providers/health')
  providerHealth() {
    return this.admin.providerHealth();
  }

  // -------------------------------------- A-16/A-17 pricing & features

  @Get('pricing')
  pricing() {
    return this.admin.getPricing();
  }

  @Put('pricing')
  setPricing(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.admin.setPricing(user, body as any);
  }

  // ------------------------------------ платформын сарын тооцоо (month-close)

  /** Сар хаах — өмнөх (эсвэл заасан) мөчлөгийн тооцоог үүсгэж нэхэмжилнэ. */
  @HttpCode(200)
  @Post('billing/close-month')
  async closeMonth(@CurrentUser() user: AuthUser, @Body() body: { cycle?: string }) {
    const cycle = body?.cycle || MonthCloseService.previousCycle();
    const result = await this.monthClose.closeMonth(cycle);
    await this.prisma.auditLog.create({
      data: { actorId: user.userId, actorEmail: user.email, action: 'admin.month_close', targetType: 'cycle', targetId: cycle, meta: result as any },
    });
    return result;
  }

  // ---------------------------- онбординг имэйл хүлээн авагчид (Bonum/LIME)

  @Get('onboarding-emails')
  async onboardingEmails() {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: 'onboardingEmails' } });
    const cfg = (row?.value as { bonumEmail?: string; limeEmail?: string } | null) ?? {};
    return {
      bonumEmail: cfg.bonumEmail ?? '',
      limeEmail: cfg.limeEmail ?? '',
      envBonumSet: Boolean(process.env.ONBOARDING_BONUM_EMAIL),
      envLimeSet: Boolean(process.env.ONBOARDING_LIME_EMAIL),
    };
  }

  @Put('onboarding-emails')
  async setOnboardingEmails(@CurrentUser() user: AuthUser, @Body() body: { bonumEmail?: string; limeEmail?: string }) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const clean = (v?: string) => {
      const t = (v ?? '').trim();
      if (t && !emailRe.test(t)) throw new Error(`Имэйл буруу форматтай: ${t}`);
      return t;
    };
    const value = { bonumEmail: clean(body.bonumEmail), limeEmail: clean(body.limeEmail) };
    await this.prisma.platformSetting.upsert({
      where: { key: 'onboardingEmails' },
      create: { key: 'onboardingEmails', value },
      update: { value },
    });
    await this.prisma.auditLog.create({
      data: { actorId: user.userId, actorEmail: user.email, action: 'admin.onboarding_emails.updated', targetType: 'setting', targetId: 'onboardingEmails', meta: value },
    });
    return value;
  }

  @Get('billing/bills')
  bills(@Query('cycle') cycle?: string, @Query('take') take?: number) {
    return this.prisma.serviceBill.findMany({
      where: cycle ? { cycle } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(take) || 100, 300),
    });
  }

  @Get('features')
  features() {
    return this.admin.getFeatures();
  }

  @Put('features')
  setFeatures(@CurrentUser() user: AuthUser, @Body() body: Record<string, boolean>) {
    return this.admin.setFeatures(user, body);
  }

  // ------------------------------------------------------ A-19 incidents

  @Get('incidents')
  incidents(@Query('status') status?: string) {
    return this.admin.incidents(status);
  }

  @Post('incidents')
  createIncident(@CurrentUser() user: AuthUser, @Body() body: { title: string; severity?: string; note?: string }) {
    return this.admin.createIncident(user, body);
  }

  @Patch('incidents/:id')
  updateIncident(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { status?: string; note?: string }) {
    return this.admin.updateIncident(user, id, body);
  }

  // ------------------------------------------------- A-20 support search

  @Get('support/search')
  supportSearch(@Query('q') q: string) {
    return this.admin.supportSearch(q ?? '');
  }

  // ------------------------------------------------------- A-21 audit

  @Get('audit')
  async audit(@Query('action') action?: string, @Query('take') take?: number, @Query('skip') skip?: number) {
    const where = action?.trim() ? { action: { contains: action.trim() } } : undefined;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(take) || 50, 200),
        skip: Number(skip) || 0,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }

  // ------------------------------------------------- A-22 admin access

  @Get('access')
  admins() {
    return this.admin.admins();
  }

  @HttpCode(200)
  @Put('access')
  setAdmin(@CurrentUser() user: AuthUser, @Body() body: { email: string; isAdmin: boolean }) {
    return this.admin.setAdmin(user, body.email, Boolean(body.isAdmin));
  }
}
