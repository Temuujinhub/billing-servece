'use client';

import { useEffect, useState } from 'react';
import { ErrorNote, InvoiceBadge, PageLoader, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { mnt, shortDate } from '@/lib/format';
import type { ReportsSummary } from '@/lib/types';

const PERIODS = [
  { days: 7, label: '7 хоног' },
  { days: 30, label: '30 хоног' },
  { days: 90, label: '90 хоног' },
  { days: 365, label: '1 жил' },
];

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1`;

export default function ReportsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ReportsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api<ReportsSummary>(`/reports/summary?days=${days}`).then(setData).catch((e) => setError(e.message));
  }, [days]);

  /** Authenticated CSV download via fetch → blob (Authorization header required). */
  async function download(type: 'invoices' | 'payments') {
    setExporting(type);
    setError(null);
    try {
      const token = localStorage.getItem('bs.accessToken');
      const res = await fetch(`${API_BASE}/reports/export?type=${type}&days=${days}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`Татаж чадсангүй (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `billingservice_${type}_${days}d.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(null);
    }
  }

  if (error && !data) return <ErrorNote message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Тайлан</h1>
          <p className="mt-1 text-sm text-slate-500">Сонгосон хугацааны нэгтгэл ба Excel-д зориулсан CSV татаж авах</p>
        </div>
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                days === p.days ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {!data ? (
        <PageLoader />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Нэхэмжлэх" value={data.invoices.count.toLocaleString()} sub={`Нийт дүн ${mnt(data.invoices.amount)}`} />
            <Stat label="Цугласан төлбөр" value={mnt(data.payments.gross)} sub={`${data.payments.count.toLocaleString()} гүйлгээ`} tone="positive" />
            <Stat label="Авах үлдэгдэл" value={mnt(data.invoices.outstanding)} tone={data.invoices.outstanding > 0 ? 'warning' : 'default'} />
            <Stat label="SMS segment" value={data.smsSegments.toLocaleString()} sub={`${shortDate(data.since)}-оос хойш`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* State breakdown */}
            <div className="card overflow-hidden">
              <h2 className="px-6 py-4 font-bold text-slate-900">Төлөвөөр</h2>
              <table className="w-full border-t border-slate-200/60">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="th">Төлөв</th>
                    <th className="th text-right">Тоо</th>
                    <th className="th text-right">Дүн</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {data.byState.length === 0 && (
                    <tr><td className="td text-slate-500" colSpan={3}>Энэ хугацаанд нэхэмжлэх алга.</td></tr>
                  )}
                  {data.byState.map((s) => (
                    <tr key={s.state}>
                      <td className="td"><InvoiceBadge state={s.state} /></td>
                      <td className="td text-right font-semibold">{s.count.toLocaleString()}</td>
                      <td className="td text-right">{mnt(s.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top customers */}
            <div className="card overflow-hidden">
              <h2 className="px-6 py-4 font-bold text-slate-900">Топ харилцагч</h2>
              <table className="w-full border-t border-slate-200/60">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="th">Харилцагч</th>
                    <th className="th text-right">Нэхэмжлэх</th>
                    <th className="th text-right">Дүн</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {data.topCustomers.length === 0 && (
                    <tr><td className="td text-slate-500" colSpan={3}>Мэдээлэл алга.</td></tr>
                  )}
                  {data.topCustomers.map((c) => (
                    <tr key={c.customerId}>
                      <td className="td font-medium">{c.name}</td>
                      <td className="td text-right">{c.invoices.toLocaleString()}</td>
                      <td className="td text-right font-semibold">{mnt(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Exports */}
          <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h2 className="font-bold text-slate-900">CSV татаж авах</h2>
              <p className="mt-1 text-[13px] text-slate-500">UTF-8 BOM-той тул Excel дээр кирилл зөв харагдана. Дээд тал нь 10,000 мөр.</p>
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary" onClick={() => download('invoices')} disabled={exporting !== null}>
                {exporting === 'invoices' ? 'Татаж байна…' : '🧾 Нэхэмжлэх CSV'}
              </button>
              <button className="btn-secondary" onClick={() => download('payments')} disabled={exporting !== null}>
                {exporting === 'payments' ? 'Татаж байна…' : '💳 Төлбөр CSV'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
