'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorNote, PageLoader, ReceiptBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, mnt } from '@/lib/format';
import type { PaymentRow } from '@/lib/types';

export default function PaymentsPage() {
  const [items, setItems] = useState<PaymentRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: PaymentRow[]; total: number }>('/payments?take=100')
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError(e.message));
  }, []);

  const gross = (items ?? []).reduce((s, p) => s + p.gross, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Төлбөр</h1>
          <p className="mt-1 text-sm text-slate-500">{total.toLocaleString()} гүйлгээ · provider-ээр баталгаажсан</p>
        </div>
        {items && items.length > 0 && (
          <p className="text-sm text-slate-500">
            Сүүлийн {items.length} гүйлгээний нийт: <b className="text-navy-900">{mnt(gross)}</b>
          </p>
        )}
      </div>

      {error && <ErrorNote message={error} onRetry={() => window.location.reload()} />}
      {!items ? (
        error ? null : <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState title="Төлбөр бүртгэгдээгүй" hint="Төлөгч линкээр орж төлснөөр энд харагдана." />
      ) : (
        <div className="card overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="th">Огноо</th>
                  <th className="th">Нэхэмжлэх</th>
                  <th className="th">Төлөгч</th>
                  <th className="th">Provider</th>
                  <th className="th">Гүйлгээний ID</th>
                  <th className="th text-right">Дүн</th>
                  <th className="th">eBarimt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {items.map((p) => (
                  <tr key={p.id} className="transition hover:bg-white/60">
                    <td className="td text-slate-500">{dateTime(p.paidAt)}</td>
                    <td className="td">
                      <Link href={`/invoices/${p.intent.invoice.id}`} className="font-semibold text-indigo-700 hover:underline">
                        {p.intent.invoice.number}
                      </Link>
                    </td>
                    <td className="td">{p.intent.invoice.customer.name}</td>
                    <td className="td text-slate-500">{p.intent.provider === 'qpay_mock' ? 'QPay (mock)' : p.intent.provider}</td>
                    <td className="td max-w-[160px] truncate font-mono text-[12px] text-slate-500">{p.providerPaymentId}</td>
                    <td className="td text-right font-semibold text-indigo-700">{mnt(p.gross)}</td>
                    <td className="td">{p.receipts[0] ? <ReceiptBadge state={p.receipts[0].state} /> : <span className="text-slate-500">—</span>}</td>
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
