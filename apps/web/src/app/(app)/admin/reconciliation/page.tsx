'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminGate, AdminHeader } from '@/components/admin';
import { EmptyState, ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dateTime, mnt, shortDate } from '@/lib/format';

interface Run {
  id: string;
  provider: string;
  periodStart: string;
  periodEnd: string;
  total: number;
  matched: number;
  mismatched: number;
  items: { intentId: string; invoiceNumber: string; tenantName: string; gross: number; issue: string }[];
  createdBy: string | null;
  createdAt: string;
}

export default function AdminReconciliationPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Run[]>('/admin/reconciliation').then(setRuns).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const r = await api<Run>('/admin/reconciliation/run', { method: 'POST', body: JSON.stringify({ days }) });
      setOpen(r.id);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Тулгалт амжилтгүй');
    } finally { setRunning(false); }
  }

  return (
    <AdminGate title="Тулгалт">
      <div className="space-y-5">
        <AdminHeader
          title="⚖️ Тулгалт (Reconciliation)"
          sub="Ledger дээрх төлөгдсөн гүйлгээ бүрийг provider payment/check-ээр дахин баталгаажуулна (A-12/13)"
          action={
            <div className="flex items-center gap-3">
              <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={1}>Сүүлийн 1 хоног</option>
                <option value={7}>Сүүлийн 7 хоног</option>
                <option value={14}>Сүүлийн 14 хоног</option>
                <option value={31}>Сүүлийн 31 хоног</option>
              </select>
              <button className="btn-primary" onClick={run} disabled={running}>
                {running ? <Spinner className="h-4 w-4 text-white" /> : '▶ Тулгалт ажиллуулах'}
              </button>
            </div>
          }
        />

        {error && <ErrorNote message={error} />}
        {!runs ? (
          <PageLoader />
        ) : runs.length === 0 ? (
          <EmptyState title="Тулгалт хийгдээгүй байна" hint="«Тулгалт ажиллуулах» товчоор эхний sweep-ээ хийгээрэй." />
        ) : (
          <div className="space-y-4">
            {runs.map((r) => (
              <div key={r.id} className="card overflow-hidden">
                <button className="flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <div>
                    <p className="font-bold text-slate-900">
                      {shortDate(r.periodStart)} → {shortDate(r.periodEnd)}
                      <span className="ml-2 text-[12.5px] font-medium text-slate-400">{dateTime(r.createdAt)} · {r.createdBy}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-[13.5px] font-bold">
                    <span className="text-slate-600">{r.total} шалгасан</span>
                    <span className="text-emerald-600">✓ {r.matched}</span>
                    <span className={r.mismatched > 0 ? 'text-red-600' : 'text-slate-400'}>⚠ {r.mismatched} зөрүү</span>
                    <span className="text-slate-400">{open === r.id ? '▲' : '▼'}</span>
                  </div>
                </button>
                {open === r.id && (
                  r.items.length === 0 ? (
                    <p className="border-t border-slate-200/60 px-6 py-4 text-sm font-semibold text-emerald-600">🎉 100% тулсан — зөрүү олдсонгүй.</p>
                  ) : (
                    <table className="w-full border-t border-slate-200/60">
                      <thead><tr><th className="th">Нэхэмжлэх</th><th className="th">Байгууллага</th><th className="th text-right">Дүн</th><th className="th">Зөрүү</th></tr></thead>
                      <tbody className="divide-y divide-slate-200/60">
                        {r.items.map((i, idx) => (
                          <tr key={idx}>
                            <td className="td">
                              <a href={`/admin/transactions/${i.intentId}`} className="font-bold text-indigo-600 hover:underline">{i.invoiceNumber}</a>
                            </td>
                            <td className="td">{i.tenantName}</td>
                            <td className="td text-right font-semibold">{mnt(i.gross)}</td>
                            <td className="td text-[12.5px] text-red-600">{i.issue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminGate>
  );
}
