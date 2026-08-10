'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AreaChart, Donut } from '@/components/charts';
import { StatProgress, StatRing, StatTrend } from '@/components/stats';
import { EmptyState, ErrorNote, InvoiceBadge, PageLoader, Stat } from '@/components/ui';
import { api, getSessionUser } from '@/lib/api';
import { mnt, shortDate } from '@/lib/format';
import type { DashboardData, TenantInfo } from '@/lib/types';

const SPLIT_COLORS: Record<string, string> = {
  PAID: '#10B981',
  PARTIALLY_PAID: '#F59E0B',
  SENT: '#0EA5E9',
  VIEWED: '#6366F1',
  OVERDUE: '#EF4444',
  DRAFT: '#94A3B8',
  CANCELLED: '#CBD5E1',
  EXPIRED: '#CBD5E1',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kybStatus, setKybStatus] = useState<string | null>(null);
  const isOwner = getSessionUser()?.role === 'OWNER';

  useEffect(() => {
    api<DashboardData>('/analytics/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
    api<TenantInfo>('/tenant')
      .then((r) => setKybStatus(r.tenant.kybStatus))
      .catch(() => undefined);
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <PageLoader />;

  const { kpis } = data;
  const split = data.stateSplit
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      {/* KYB call-to-action (M-03) */}
      {isOwner && kybStatus && ['DRAFT', 'NEEDS_INFO', 'REJECTED'].includes(kybStatus) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-5 py-4 backdrop-blur-md">
          <div>
            <p className="font-bold text-amber-900">Байгууллагаа баталгаажуулаарай</p>
            <p className="mt-0.5 text-[13.5px] text-amber-800">
              {kybStatus === 'NEEDS_INFO'
                ? 'Нэмэлт мэдээлэл шаардлагатай — профайлаа шинэчлээд дахин илгээнэ үү.'
                : 'Регистр, банкны данс зэрэг мэдээллээ бөглөж илгээснээр бүрэн эрх нээгдэнэ.'}
            </p>
          </div>
          <Link href="/onboarding" className="btn-primary shrink-0 px-4 py-2 text-[13.5px]">Баталгаажуулах →</Link>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Хянах самбар</h1>
          <p className="mt-1 text-sm text-slate-500">Авлага, төлөлт, eBarimt — нэг дор.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/imports" className="btn-secondary">📥 Excel импорт</Link>
          <Link href="/invoices/new" className="btn-primary">+ Нэхэмжлэх</Link>
        </div>
      </div>

      {/* Premium KPI row: neon trend · gradient progress · radial ring */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <StatTrend
          label="Энэ сард цугласан"
          value={mnt(kpis.collectedThisMonth)}
          sub={`${kpis.paymentsThisMonth} төлөлт · 30 хоногт ${mnt(kpis.collected30d)}`}
          series={data.series.map((d) => d.amount)}
        />
        <StatProgress
          label="Авлагын үлдэгдэл"
          value={mnt(kpis.outstandingBalance)}
          sub={`${kpis.outstandingCount} нээлттэй нэхэмжлэх`}
          percent={kpis.paymentRate}
        />
        <StatRing
          label="eBarimt автоматжуулалт"
          value={kpis.receiptPending > 0 ? `${kpis.receiptPending} хүлээгдэж буй` : 'Бүгд амжилттай'}
          sub={`Энэ сарын SMS: ${kpis.smsSegmentsThisMonth.toLocaleString()} segment`}
          percent={data.totalInvoices > 0 ? Math.round(100 - Math.min(100, (kpis.receiptPending / Math.max(1, kpis.paymentsThisMonth)) * 100)) : 100}
          tone={kpis.receiptPending > 0 ? 'amber' : 'emerald'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Collections trend */}
        <div className="card p-6 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Төлөлтийн урсгал — сүүлийн 30 хоног</h2>
            <span className="text-[13px] font-semibold text-indigo-600">{mnt(kpis.collected30d)}</span>
          </div>
          <AreaChart data={data.series} formatValue={mnt} />
        </div>

        {/* State split */}
        <div className="card p-6">
          <h2 className="mb-4 font-bold text-slate-900">Нэхэмжлэхийн төлөв</h2>
          {split.length === 0 ? (
            <EmptyState title="Нэхэмжлэх алга" hint="Эхний нэхэмжлэхээ үүсгээрэй." />
          ) : (
            <Donut
              segments={split.map((s) => ({
                label: s.state,
                value: s.count,
                color: SPLIT_COLORS[s.state] ?? '#9FB4CB',
              }))}
              centerLabel="нийт"
              centerValue={String(data.totalInvoices)}
            />
          )}
          <p className="mt-4 border-t border-slate-200/60 pt-3 text-[13px] text-slate-500">
            Энэ сарын SMS: <b className="text-navy-800">{kpis.smsSegmentsThisMonth.toLocaleString()} segment</b>
          </p>
        </div>
      </div>

      {/* Recent invoices */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="font-bold text-slate-900">Сүүлийн нэхэмжлэхүүд</h2>
          <Link href="/invoices" className="text-[13.5px] font-semibold text-indigo-600 hover:text-indigo-700">
            Бүгдийг үзэх →
          </Link>
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[640px] border-t border-slate-200/60">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="th">№</th>
                <th className="th">Төлөгч</th>
                <th className="th">Төлөв</th>
                <th className="th text-right">Дүн</th>
                <th className="th text-right">Үлдэгдэл</th>
                <th className="th">Дуусах</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {data.recentInvoices.map((inv) => (
                <tr key={inv.id} className="transition hover:bg-white/60">
                  <td className="td">
                    <Link href={`/invoices/${inv.id}`} className="font-semibold text-indigo-700 hover:underline">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="td">{inv.customerName}</td>
                  <td className="td"><InvoiceBadge state={inv.state} /></td>
                  <td className="td text-right font-semibold">{mnt(inv.amount)}</td>
                  <td className="td text-right">{inv.balance > 0 ? mnt(inv.balance) : '—'}</td>
                  <td className="td text-slate-500">{shortDate(inv.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
