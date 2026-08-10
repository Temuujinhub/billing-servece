'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminGate, AdminHeader } from '@/components/admin';
import { ErrorNote, PageLoader, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, mnt } from '@/lib/format';

interface Overview {
  kpis: {
    tenants: number;
    users: number;
    invoices: number;
    invoicedTotal: number;
    payments30d: number;
    collected30d: number;
    receiptPending: number;
    smsFailed: number;
    openIncidents: number;
  };
  audit: { id: string; actorEmail: string | null; action: string; targetType: string | null; targetId: string | null; createdAt: string }[];
}

const QUICK_LINKS = [
  { href: '/admin/merchants', label: '🏢 Байгууллага / KYB' },
  { href: '/admin/transactions', label: '🧮 Гүйлгээ' },
  { href: '/admin/ops', label: '🚦 Ops дараалал' },
  { href: '/admin/reconciliation', label: '⚖️ Тулгалт' },
  { href: '/admin/providers', label: '💓 Provider health' },
  { href: '/admin/support', label: '🔎 Хайлт' },
];

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Overview>('/admin/overview').then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <AdminGate title="Админ самбар">
      <div className="space-y-6">
        <AdminHeader title="🛡️ Админ самбар" sub="Платформын нийт үзүүлэлт, шуурхай холбоосууд, аудит" />
        {error && <ErrorNote message={error} />}
        {!data ? (
          <PageLoader />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Байгууллага / хэрэглэгч" value={`${data.kpis.tenants} / ${data.kpis.users}`} />
              <Stat label="Нийт нэхэмжлэх" value={data.kpis.invoices.toLocaleString()} sub={mnt(data.kpis.invoicedTotal)} />
              <Stat label="30 хоногт цугласан" value={mnt(data.kpis.collected30d)} sub={`${data.kpis.payments30d} төлөлт`} tone="positive" />
              <Stat
                label="Анхаарах асуудал"
                value={data.kpis.receiptPending + data.kpis.smsFailed + data.kpis.openIncidents}
                sub={`eBarimt ${data.kpis.receiptPending} · SMS ${data.kpis.smsFailed} · Incident ${data.kpis.openIncidents}`}
                tone={data.kpis.receiptPending + data.kpis.smsFailed + data.kpis.openIncidents > 0 ? 'warning' : 'positive'}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {QUICK_LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="card px-5 py-4 text-[14px] font-bold text-slate-800 hover:text-indigo-700">
                  {l.label} →
                </Link>
              ))}
            </div>

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4">
                <h2 className="font-bold text-slate-900">Сүүлийн үйлдлүүд</h2>
                <Link href="/admin/audit" className="text-[13.5px] font-semibold text-indigo-600 hover:text-indigo-700">Audit explorer →</Link>
              </div>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[640px] border-t border-slate-200/60">
                  <thead>
                    <tr>
                      <th className="th">Огноо</th>
                      <th className="th">Хэн</th>
                      <th className="th">Үйлдэл</th>
                      <th className="th">Объект</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60">
                    {data.audit.map((a) => (
                      <tr key={a.id}>
                        <td className="td whitespace-nowrap text-slate-500">{dateTime(a.createdAt)}</td>
                        <td className="td">{a.actorEmail ?? 'систем'}</td>
                        <td className="td font-mono text-[12.5px]">{a.action}</td>
                        <td className="td text-slate-500">{a.targetType ? `${a.targetType}:${(a.targetId ?? '').slice(0, 8)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminGate>
  );
}
