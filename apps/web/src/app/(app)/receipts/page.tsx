'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorNote, PageLoader, ReceiptBadge, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dateTime, mnt } from '@/lib/format';
import type { ReceiptRow } from '@/lib/types';

export default function ReceiptsPage() {
  const [items, setItems] = useState<ReceiptRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ items: ReceiptRow[]; total: number }>('/receipts?take=100')
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function retry(id: string) {
    setRetrying(id);
    setError(null);
    try {
      await api(`/receipts/${id}/retry`, { method: 'POST' });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setRetrying(null);
    }
  }

  const failed = (items ?? []).filter((r) => r.state === 'FAILED').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">eBarimt</h1>
        <p className="mt-1 text-sm text-slate-500">
          {total.toLocaleString()} баримт
          {failed > 0 && <> · <span className="font-semibold text-red-600">{failed} амжилтгүй — дахин оролдоно уу</span></>}
        </p>
      </div>

      {error && <ErrorNote message={error} onRetry={() => window.location.reload()} />}
      {!items ? (
        error ? null : <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState title="Баримт үүсээгүй байна" hint="Төлбөр амжилттай болмогц eBarimt автоматаар үүснэ." />
      ) : (
        <div className="card overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="th">Огноо</th>
                  <th className="th">Нэхэмжлэх</th>
                  <th className="th">Төлөгч</th>
                  <th className="th text-right">Дүн</th>
                  <th className="th">Баримтын №</th>
                  <th className="th">Сугалаа</th>
                  <th className="th">Төлөв</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {items.map((r) => (
                  <tr key={r.id} className="transition hover:bg-white/60">
                    <td className="td text-slate-500">{dateTime(r.createdAt)}</td>
                    <td className="td">
                      <Link href={`/invoices/${r.transaction.intent.invoice.id}`} className="font-semibold text-indigo-700 hover:underline">
                        {r.transaction.intent.invoice.number}
                      </Link>
                    </td>
                    <td className="td">{r.transaction.intent.invoice.customer.name}</td>
                    <td className="td text-right font-semibold">{mnt(r.transaction.gross)}</td>
                    <td className="td max-w-[150px] truncate font-mono text-[12px]">{r.receiptNo ?? '—'}</td>
                    <td className="td font-mono text-[13px] tracking-wider">{r.lottery ?? '—'}</td>
                    <td className="td">
                      <ReceiptBadge state={r.state} />
                      {r.error && <p className="mt-1 max-w-[180px] truncate text-[11.5px] text-red-500" title={r.error}>{r.error}</p>}
                    </td>
                    <td className="td">
                      {r.state === 'FAILED' && (
                        <button onClick={() => retry(r.id)} disabled={retrying === r.id} className="btn-secondary px-3 py-1.5 text-[12.5px]">
                          {retrying === r.id ? <Spinner className="h-4 w-4" /> : '↻ Дахих'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
