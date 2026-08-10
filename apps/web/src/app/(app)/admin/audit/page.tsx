'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminGate, AdminHeader } from '@/components/admin';
import { EmptyState, ErrorNote, PageLoader } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';

interface Row {
  id: string; tenantId: string | null; actorEmail: string | null; action: string;
  targetType: string | null; targetId: string | null; meta: any; createdAt: string;
}

const PAGE = 50;

export default function AdminAuditPage() {
  const [items, setItems] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [action, setAction] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ take: String(PAGE), skip: String(page * PAGE) });
    if (filter) params.set('action', filter);
    api<{ items: Row[]; total: number }>(`/admin/audit?${params}`)
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => setError(e.message));
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <AdminGate title="Audit">
      <div className="space-y-5">
        <AdminHeader title="📜 Audit explorer" sub={`${total.toLocaleString()} бичлэг — үйлдэл бүр хэн/хэзээ/юу (A-21, immutable)`} />

        <form className="card flex gap-2 p-4" onSubmit={(e) => { e.preventDefault(); setPage(0); setFilter(action.trim()); }}>
          <input className="input" placeholder="Үйлдлээр шүүх… (ж: refund, kyb, pricing)" value={action} onChange={(e) => setAction(e.target.value)} />
          <button type="submit" className="btn-secondary shrink-0">Шүүх</button>
        </form>

        {error && <ErrorNote message={error} />}
        {!items ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <EmptyState title="Бичлэг олдсонгүй" />
        ) : (
          <div className="card overflow-hidden">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead><tr><th className="th">Огноо</th><th className="th">Хэн</th><th className="th">Үйлдэл</th><th className="th">Объект</th><th className="th">Дэлгэрэнгүй</th></tr></thead>
                <tbody className="divide-y divide-slate-200/60">
                  {items.map((a) => (
                    <tr key={a.id}>
                      <td className="td whitespace-nowrap text-slate-500">{dateTime(a.createdAt)}</td>
                      <td className="td font-semibold">{a.actorEmail ?? 'систем'}</td>
                      <td className="td"><span className="rounded-lg bg-white/70 px-2 py-1 font-mono text-[12px] ring-1 ring-inset ring-slate-200">{a.action}</span></td>
                      <td className="td text-slate-500">{a.targetType ? `${a.targetType}:${(a.targetId ?? '').slice(0, 8)}` : '—'}</td>
                      <td className="td max-w-[280px] truncate font-mono text-[11.5px] text-slate-400" title={a.meta ? JSON.stringify(a.meta) : ''}>
                        {a.meta ? JSON.stringify(a.meta) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200/60 px-5 py-3 text-sm">
              <p className="text-slate-500">Хуудас {page + 1} / {pages}</p>
              <div className="flex gap-2">
                <button className="btn-secondary px-3 py-1.5" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Өмнөх</button>
                <button className="btn-secondary px-3 py-1.5" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Дараах →</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGate>
  );
}
