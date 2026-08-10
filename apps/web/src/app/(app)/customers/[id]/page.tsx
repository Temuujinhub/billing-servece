'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorNote, InvoiceBadge, PageLoader } from '@/components/ui';
import { api } from '@/lib/api';
import { mnt, shortDate } from '@/lib/format';
import type { Customer, Invoice } from '@/lib/types';

type CustomerDetail = Customer & { invoices: Omit<Invoice, 'customer'>[] };

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CustomerDetail>(`/customers/${id}`).then(setCustomer).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <ErrorNote message={error} />;
  if (!customer) return <PageLoader />;

  const totals = customer.invoices.reduce(
    (acc, i) => {
      acc.amount += i.amount;
      acc.balance += ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.state) ? i.balance : 0;
      return acc;
    },
    { amount: 0, balance: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/customers" className="text-[13.5px] font-semibold text-indigo-600 hover:text-indigo-700">← Харилцагч руу буцах</Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{customer.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {customer.phone ?? 'Утасгүй'} {customer.email ? `· ${customer.email}` : ''} {customer.externalRef ? `· ${customer.externalRef}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card px-5 py-4">
          <p className="text-[13px] text-slate-500">Нийт нэхэмжилсэн</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{mnt(totals.amount)}</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-[13px] text-slate-500">Нээлттэй үлдэгдэл</p>
          <p className={`mt-1 text-xl font-bold ${totals.balance > 0 ? 'text-amber-600' : 'text-indigo-600'}`}>{mnt(totals.balance)}</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-[13px] text-slate-500">Нэхэмжлэхийн тоо</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{customer._count?.invoices ?? customer.invoices.length}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <h2 className="px-6 py-4 font-bold text-slate-900">Нэхэмжлэхүүд</h2>
        <table className="w-full border-t border-slate-200/60">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="th">№</th>
              <th className="th">Тайлбар</th>
              <th className="th">Төлөв</th>
              <th className="th text-right">Дүн</th>
              <th className="th">Дуусах</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60">
            {customer.invoices.map((i) => (
              <tr key={i.id} className="transition hover:bg-white/60">
                <td className="td">
                  <Link href={`/invoices/${i.id}`} className="font-semibold text-indigo-700 hover:underline">{i.number}</Link>
                </td>
                <td className="td max-w-[260px] truncate text-slate-500">{i.description}</td>
                <td className="td"><InvoiceBadge state={i.state} /></td>
                <td className="td text-right font-semibold">{mnt(i.amount)}</td>
                <td className="td text-slate-500">{shortDate(i.dueDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
