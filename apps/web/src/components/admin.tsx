'use client';

import { ReactNode } from 'react';
import { getSessionUser } from '@/lib/api';

/** Client-side gate for /admin pages (the API enforces the real check). */
export function AdminGate({ title, children }: { title: string; children: ReactNode }) {
  const isAdmin = getSessionUser()?.isAdmin === true;
  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 backdrop-blur-md">
          Энэ хэсэгт зөвхөн платформын админ хандана. Админ эрхтэй бол дахин нэвтэрч орно уу.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

export function AdminHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export const KYB_MN: Record<string, string> = {
  DRAFT: 'Ноорог',
  SUBMITTED: 'Илгээсэн',
  UNDER_REVIEW: 'Хянагдаж буй',
  APPROVED: 'Баталгаажсан',
  REJECTED: 'Татгалзсан',
  NEEDS_INFO: 'Мэдээлэл дутуу',
};

export function KybPill({ status }: { status: string }) {
  const tone =
    status === 'APPROVED' ? 'bg-emerald-50/80 text-emerald-700 ring-emerald-200'
    : status === 'REJECTED' ? 'bg-red-50/80 text-red-600 ring-red-200'
    : 'bg-amber-50/80 text-amber-700 ring-amber-200';
  return (
    <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ring-1 ring-inset ${tone}`}>
      {KYB_MN[status] ?? status}
    </span>
  );
}
