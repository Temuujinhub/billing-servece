'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AdminGate, AdminHeader, KybPill } from '@/components/admin';
import { EmptyState, ErrorNote, PageLoader } from '@/components/ui';
import { api } from '@/lib/api';
import { shortDate } from '@/lib/format';

interface Row {
  id: string;
  name: string;
  regNo: string | null;
  status: string;
  kybStatus: string;
  contactEmail: string | null;
  createdAt: string;
  _count: { invoices: number; customers: number; memberships: number };
}

const KYB_FILTERS = ['ALL', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED'];
const KYB_FILTER_MN: Record<string, string> = {
  ALL: 'Бүгд', SUBMITTED: 'Илгээсэн', UNDER_REVIEW: 'Хянагдаж буй', NEEDS_INFO: 'Мэдээлэл дутуу', APPROVED: 'Баталгаажсан', REJECTED: 'Татгалзсан',
};

export default function AdminMerchantsPage() {
  const [items, setItems] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [kyb, setKyb] = useState('ALL');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ take: '100', kyb });
    if (query) params.set('search', query);
    api<{ items: Row[]; total: number }>(`/admin/merchants?${params}`)
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => setError(e.message));
  }, [query, kyb]);

  useEffect(() => { load(); }, [load]);

  return (
    <AdminGate title="Байгууллага / KYB">
      <div className="space-y-5">
        <AdminHeader title="🏢 Байгууллага / KYB" sub={`${total} байгууллага — KYB хянан баталгаажуулалт (A-03/A-05)`} />

        <div className="card flex flex-wrap items-center gap-3 p-4">
          <form className="flex min-w-[220px] flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}>
            <input className="input" placeholder="Нэр, регистр, имэйлээр хайх…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="submit" className="btn-secondary shrink-0">Хайх</button>
          </form>
          <div className="scroll-thin flex gap-1.5 overflow-x-auto">
            {KYB_FILTERS.map((f) => (
              <button key={f} onClick={() => setKyb(f)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${kyb === f ? 'bg-slate-900 text-white' : 'bg-white/60 text-slate-600 hover:bg-white'}`}>
                {KYB_FILTER_MN[f]}
              </button>
            ))}
          </div>
        </div>

        {error && <ErrorNote message={error} />}
        {!items ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <EmptyState title="Байгууллага олдсонгүй" />
        ) : (
          <div className="card overflow-hidden">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr>
                    <th className="th">Нэр</th>
                    <th className="th">Регистр</th>
                    <th className="th">KYB</th>
                    <th className="th">Статус</th>
                    <th className="th text-right">Нэхэмжлэх</th>
                    <th className="th text-right">Гишүүд</th>
                    <th className="th">Бүртгүүлсэн</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {items.map((t) => (
                    <tr key={t.id}>
                      <td className="td">
                        <Link href={`/admin/merchants/${t.id}`} className="font-bold text-indigo-600 hover:underline">{t.name}</Link>
                        <p className="text-[12px] text-slate-400">{t.contactEmail ?? ''}</p>
                      </td>
                      <td className="td text-slate-500">{t.regNo ?? '—'}</td>
                      <td className="td"><KybPill status={t.kybStatus} /></td>
                      <td className="td">
                        {t.status === 'ACTIVE'
                          ? <span className="text-[12.5px] font-bold text-emerald-600">Идэвхтэй</span>
                          : <span className="text-[12.5px] font-bold text-red-600">Түдгэлзсэн</span>}
                      </td>
                      <td className="td text-right">{t._count.invoices}</td>
                      <td className="td text-right">{t._count.memberships}</td>
                      <td className="td text-slate-500">{shortDate(t.createdAt)}</td>
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
