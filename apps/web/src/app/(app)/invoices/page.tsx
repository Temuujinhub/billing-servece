'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorNote, InvoiceBadge, PageLoader } from '@/components/ui';
import { api } from '@/lib/api';
import { INVOICE_STATE_MN, mnt, shortDate } from '@/lib/format';
import type { Invoice, InvoiceState } from '@/lib/types';

const PAGE = 25;
const FILTERS: (InvoiceState | 'ALL')[] = ['ALL', 'SENT', 'VIEWED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED'];

export default function InvoicesPage() {
  const [items, setItems] = useState<Invoice[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [state, setState] = useState<InvoiceState | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('take', String(PAGE));
      params.set('skip', String(page * PAGE));
      if (state !== 'ALL') params.set('state', state);
      if (query) params.set('search', query);
      const res = await api<{ items: Invoice[]; total: number }>(`/invoices?${params.toString()}`);
      setItems(res.items);
      setTotal(res.total);
    } catch (e: any) {
      setError(e.message);
    }
  }, [page, state, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Нэхэмжлэх</h1>
          <p className="mt-1 text-sm text-slate-500">{total.toLocaleString()} бичлэг</p>
        </div>
        <div className="flex gap-3">
          <Link href="/imports" className="btn-secondary">📥 Excel импорт</Link>
          <Link href="/invoices/new" className="btn-primary">+ Нэхэмжлэх</Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <form
          className="flex min-w-[220px] flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setQuery(search.trim());
          }}
        >
          <input
            className="input"
            placeholder="Дугаар, нэр, утас, тайлбараар хайх…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Хайлт"
          />
          <button type="submit" className="btn-secondary shrink-0">Хайх</button>
        </form>
        <div className="scroll-thin flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => {
                setState(f);
                setPage(0);
              }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                state === f ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
              }`}
            >
              {f === 'ALL' ? 'Бүгд' : INVOICE_STATE_MN[f]}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {!items ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          title="Нэхэмжлэх олдсонгүй"
          hint="Шүүлтүүрээ өөрчлөх эсвэл шинэ нэхэмжлэх үүсгээрэй."
          action={<Link href="/invoices/new" className="btn-primary">+ Нэхэмжлэх үүсгэх</Link>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="th">№</th>
                  <th className="th">Төлөгч</th>
                  <th className="th">Тайлбар</th>
                  <th className="th">Төлөв</th>
                  <th className="th text-right">Дүн</th>
                  <th className="th text-right">Үлдэгдэл</th>
                  <th className="th">Дуусах</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {items.map((inv) => (
                  <tr key={inv.id} className="transition hover:bg-white/60">
                    <td className="td">
                      <Link href={`/invoices/${inv.id}`} className="font-semibold text-indigo-700 hover:underline">
                        {inv.number}
                      </Link>
                    </td>
                    <td className="td">
                      <p className="font-medium">{inv.customer.name}</p>
                      <p className="text-[12px] text-slate-500">{inv.customer.phone ?? ''}</p>
                    </td>
                    <td className="td max-w-[220px] truncate text-slate-500">{inv.description}</td>
                    <td className="td"><InvoiceBadge state={inv.state} /></td>
                    <td className="td text-right font-semibold">{mnt(inv.amount)}</td>
                    <td className="td text-right">{inv.balance > 0 ? mnt(inv.balance) : '—'}</td>
                    <td className="td text-slate-500">{shortDate(inv.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200/60 px-5 py-3 text-sm">
            <p className="text-slate-500">
              Хуудас {page + 1} / {pages}
            </p>
            <div className="flex gap-2">
              <button className="btn-secondary px-3 py-1.5" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                ← Өмнөх
              </button>
              <button className="btn-secondary px-3 py-1.5" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                Дараах →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
