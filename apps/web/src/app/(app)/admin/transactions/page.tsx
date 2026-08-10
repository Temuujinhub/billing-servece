'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AdminGate, AdminHeader } from '@/components/admin';
import { EmptyState, ErrorNote, PageLoader } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, mnt } from '@/lib/format';

interface Row {
  id: string;
  provider: string;
  state: string;
  amount: number;
  providerInvoiceId: string | null;
  createdAt: string;
  invoice: { number: string; tenant: { id: string; name: string } };
  transactions: { id: string; providerPaymentId: string; gross: number; status: string; refundedAt: string | null }[];
}

const STATES = ['ALL', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED'];
const STATE_MN: Record<string, string> = { ALL: 'Бүгд', PENDING: 'Хүлээгдэж буй', SUCCEEDED: 'Амжилттай', FAILED: 'Амжилтгүй', EXPIRED: 'Хугацаа дууссан', CANCELLED: 'Цуцалсан' };

export default function AdminTransactionsPage() {
  const [items, setItems] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState('ALL');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ take: '100', state });
    if (query) params.set('search', query);
    api<{ items: Row[]; total: number }>(`/admin/transactions?${params}`)
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => setError(e.message));
  }, [state, query]);

  useEffect(() => { load(); }, [load]);

  return (
    <AdminGate title="Гүйлгээ">
      <div className="space-y-5">
        <AdminHeader title="🧮 Гүйлгээ" sub={`${total} payment intent — бүх байгууллагаар (A-07)`} />

        <div className="card flex flex-wrap items-center gap-3 p-4">
          <form className="flex min-w-[220px] flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}>
            <input className="input" placeholder="Invoice №, provider invoice/payment ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="submit" className="btn-secondary shrink-0">Хайх</button>
          </form>
          <div className="scroll-thin flex gap-1.5 overflow-x-auto">
            {STATES.map((f) => (
              <button key={f} onClick={() => setState(f)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${state === f ? 'bg-slate-900 text-white' : 'bg-white/60 text-slate-600 hover:bg-white'}`}>
                {STATE_MN[f]}
              </button>
            ))}
          </div>
        </div>

        {error && <ErrorNote message={error} />}
        {!items ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <EmptyState title="Гүйлгээ олдсонгүй" />
        ) : (
          <div className="card overflow-hidden">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr>
                    <th className="th">Огноо</th>
                    <th className="th">Нэхэмжлэх</th>
                    <th className="th">Байгууллага</th>
                    <th className="th">Provider</th>
                    <th className="th">Төлөв</th>
                    <th className="th text-right">Дүн</th>
                    <th className="th">Гүйлгээ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td className="td whitespace-nowrap text-slate-500">{dateTime(r.createdAt)}</td>
                      <td className="td">
                        <Link href={`/admin/transactions/${r.id}`} className="font-bold text-indigo-600 hover:underline">{r.invoice.number}</Link>
                      </td>
                      <td className="td">{r.invoice.tenant.name}</td>
                      <td className="td text-slate-500">{r.provider === 'qpay' ? 'QPay' : 'Mock'}</td>
                      <td className="td">
                        <span className={`text-[12.5px] font-bold ${
                          r.state === 'SUCCEEDED' ? 'text-emerald-600' : r.state === 'FAILED' ? 'text-red-600' : 'text-slate-500'
                        }`}>{STATE_MN[r.state] ?? r.state}</span>
                      </td>
                      <td className="td text-right font-semibold">{mnt(r.amount)}</td>
                      <td className="td text-[12px] text-slate-500">
                        {r.transactions.map((t) => (
                          <span key={t.id} className={t.status === 'REFUNDED' ? 'text-red-500' : ''}>
                            {t.status === 'REFUNDED' ? '↩ буцаагдсан' : `✓ ${mnt(t.gross)}`}{' '}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminGate>
  );
}
