'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AreaChart, Donut } from '@/components/charts';
import { EmptyState, ErrorNote, InvoiceBadge, PageLoader, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { mnt, shortDate } from '@/lib/format';
import type { DashboardData } from '@/lib/types';

const SPLIT_COLORS: Record<string, string> = {
  PAID: '#12A186',
  PARTIALLY_PAID: '#F5A623',
  SENT: '#4A90D9',
  VIEWED: '#6C6FE0',
  OVERDUE: '#E4574F',
  DRAFT: '#9FB4CB',
  CANCELLED: '#C9D6E4',
  EXPIRED: '#C9D6E4',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DashboardData>('/analytics/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <PageLoader />;

  const { kpis } = data;
  const split = data.stateSplit
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Хянах самбар</h1>
          <p className="mt-1 text-sm text-muted">Авлага, төлөлт, eBarimt — нэг дор.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/imports" className="btn-secondary">📥 Excel импорт</Link>
          <Link href="/invoices/new" className="btn-primary">+ Нэхэмжлэх</Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Энэ сард цугласан" value={mnt(kpis.collectedThisMonth)} sub={`${kpis.paymentsThisMonth} төлөлт`} tone="positive" />
        <Stat label="Авлагын үлдэгдэл" value={mnt(kpis.outstandingBalance)} sub={`${kpis.outstandingCount} нээлттэй нэхэмжлэх`} />
        <Stat label="Төлөлтийн хувь" value={`${kpis.paymentRate}%`} sub="Илгээснээс төлөгдсөн" tone={kpis.paymentRate >= 60 ? 'positive' : 'warning'} />
        <Stat
          label="eBarimt хүлээгдэж буй"
          value={kpis.receiptPending}
          sub={kpis.receiptPending > 0 ? 'Анхаарал шаардана' : 'Бүгд амжилттай'}
          tone={kpis.receiptPending > 0 ? 'warning' : 'positive'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Collections trend */}
        <div className="card p-6 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-navy-900">Төлөлтийн урсгал — сүүлийн 30 хоног</h2>
            <span className="text-[13px] font-semibold text-teal-600">{mnt(kpis.collected30d)}</span>
          </div>
          <AreaChart data={data.series} formatValue={mnt} />
        </div>

        {/* State split */}
        <div className="card p-6">
          <h2 className="mb-4 font-bold text-navy-900">Нэхэмжлэхийн төлөв</h2>
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
          <p className="mt-4 border-t border-line pt-3 text-[13px] text-muted">
            Энэ сарын SMS: <b className="text-navy-800">{kpis.smsSegmentsThisMonth.toLocaleString()} segment</b>
          </p>
        </div>
      </div>

      {/* Recent invoices */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="font-bold text-navy-900">Сүүлийн нэхэмжлэхүүд</h2>
          <Link href="/invoices" className="text-[13.5px] font-semibold text-teal-600 hover:text-teal-700">
            Бүгдийг үзэх →
          </Link>
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[640px] border-t border-line">
            <thead className="bg-navy-50/60">
              <tr>
                <th className="th">№</th>
                <th className="th">Төлөгч</th>
                <th className="th">Төлөв</th>
                <th className="th text-right">Дүн</th>
                <th className="th text-right">Үлдэгдэл</th>
                <th className="th">Дуусах</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.recentInvoices.map((inv) => (
                <tr key={inv.id} className="transition hover:bg-navy-50/40">
                  <td className="td">
                    <Link href={`/invoices/${inv.id}`} className="font-semibold text-teal-700 hover:underline">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="td">{inv.customerName}</td>
                  <td className="td"><InvoiceBadge state={inv.state} /></td>
                  <td className="td text-right font-semibold">{mnt(inv.amount)}</td>
                  <td className="td text-right">{inv.balance > 0 ? mnt(inv.balance) : '—'}</td>
                  <td className="td text-muted">{shortDate(inv.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
