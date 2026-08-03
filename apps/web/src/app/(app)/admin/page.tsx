'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorNote, PageLoader, Stat } from '@/components/ui';
import { api, getSessionUser } from '@/lib/api';
import { dateTime, mnt, shortDate } from '@/lib/format';

interface AdminOverview {
  kpis: {
    tenants: number;
    users: number;
    invoices: number;
    invoicedTotal: number;
    payments30d: number;
    collected30d: number;
    receiptPending: number;
    smsFailed: number;
  };
  tenants: {
    id: string;
    name: string;
    kybStatus: string;
    status: string;
    createdAt: string;
    _count: { invoices: number; customers: number; memberships: number };
  }[];
  audit: {
    id: string;
    actorEmail: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    createdAt: string;
  }[];
}

const KYB_MN: Record<string, string> = {
  DRAFT: 'Ноорог',
  SUBMITTED: 'Илгээсэн',
  UNDER_REVIEW: 'Хянагдаж буй',
  APPROVED: 'Баталгаажсан',
  REJECTED: 'Татгалзсан',
  NEEDS_INFO: 'Мэдээлэл дутуу',
};

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = getSessionUser()?.isAdmin === true;

  useEffect(() => {
    if (!isAdmin) return;
    api<AdminOverview>('/admin/overview').then(setData).catch((e) => setError(e.message));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Админ самбар</h1>
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Энэ хэсэгт зөвхөн платформын админ хандана. Админ эрхтэй бол дахин нэвтэрч орно уу.
        </p>
      </div>
    );
  }

  if (error) return <ErrorNote message={error} />;
  if (!data) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900">
            🛡️ Админ самбар
          </h1>
          <p className="mt-1 text-sm text-slate-500">Платформын нийт үзүүлэлт, байгууллагууд, аудит</p>
        </div>
        <Link href="/admin/integrations" className="btn-primary">🔌 Интеграци удирдах</Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Байгууллага / хэрэглэгч" value={`${data.kpis.tenants} / ${data.kpis.users}`} />
        <Stat label="Нийт нэхэмжлэх" value={data.kpis.invoices.toLocaleString()} sub={mnt(data.kpis.invoicedTotal)} />
        <Stat label="30 хоногт цугласан" value={mnt(data.kpis.collected30d)} sub={`${data.kpis.payments30d} төлөлт`} tone="positive" />
        <Stat
          label="Анхаарах"
          value={data.kpis.receiptPending + data.kpis.smsFailed}
          sub={`eBarimt: ${data.kpis.receiptPending} · SMS алдаа: ${data.kpis.smsFailed}`}
          tone={data.kpis.receiptPending + data.kpis.smsFailed > 0 ? 'warning' : 'positive'}
        />
      </div>

      <div className="card overflow-hidden">
        <h2 className="px-6 py-4 font-bold text-slate-900">Байгууллагууд</h2>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[640px] border-t border-slate-200/60">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="th">Нэр</th>
                <th className="th">KYB</th>
                <th className="th text-right">Нэхэмжлэх</th>
                <th className="th text-right">Харилцагч</th>
                <th className="th text-right">Гишүүд</th>
                <th className="th">Бүртгүүлсэн</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {data.tenants.map((t) => (
                <tr key={t.id} className="transition hover:bg-white/60">
                  <td className="td font-semibold">{t.name}</td>
                  <td className="td">
                    <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${
                      t.kybStatus === 'APPROVED' ? 'bg-teal-50 text-indigo-700 ring-teal-200' : 'bg-amber-50 text-amber-700 ring-amber-200'
                    }`}>
                      {KYB_MN[t.kybStatus] ?? t.kybStatus}
                    </span>
                  </td>
                  <td className="td text-right">{t._count.invoices}</td>
                  <td className="td text-right">{t._count.customers}</td>
                  <td className="td text-right">{t._count.memberships}</td>
                  <td className="td text-slate-500">{shortDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <h2 className="px-6 py-4 font-bold text-slate-900">Сүүлийн үйлдлүүд (audit)</h2>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[640px] border-t border-slate-200/60">
            <thead className="bg-slate-50/50">
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
    </div>
  );
}
