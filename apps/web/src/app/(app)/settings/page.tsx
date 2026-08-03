'use client';

import { useEffect, useState } from 'react';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';
import { shortDate } from '@/lib/format';
import type { TenantInfo } from '@/lib/types';

const ROLE_MN: Record<string, string> = {
  OWNER: 'Эзэмшигч',
  OPERATOR: 'Оператор',
  ACCOUNTANT: 'Нягтлан',
  VIEWER: 'Үзэгч',
};

const KYB_MN: Record<string, string> = {
  DRAFT: 'Ноорог',
  SUBMITTED: 'Илгээсэн',
  UNDER_REVIEW: 'Хянагдаж буй',
  APPROVED: 'Баталгаажсан',
  REJECTED: 'Татгалзсан',
  NEEDS_INFO: 'Мэдээлэл дутуу',
};

export default function SettingsPage() {
  const [info, setInfo] = useState<TenantInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOwner = getSessionUser()?.role === 'OWNER';

  useEffect(() => {
    api<TenantInfo>('/tenant')
      .then((r) => {
        setInfo(r);
        setName(r.tenant.name);
        setPrefix(r.tenant.invoicePrefix);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api('/tenant', { method: 'PATCH', body: JSON.stringify({ name: name.trim(), invoicePrefix: prefix.trim().toUpperCase() }) });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  if (error && !info) return <ErrorNote message={error} />;
  if (!info) return <PageLoader />;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Тохиргоо</h1>
        <p className="mt-1 text-sm text-muted">
          KYB төлөв: <b className="text-navy-800">{KYB_MN[info.tenant.kybStatus] ?? info.tenant.kybStatus}</b>
          {info.tenant.regNo && <> · Регистр: {info.tenant.regNo}</>}
        </p>
      </div>

      <div className="card space-y-5 p-6">
        <h2 className="font-bold text-navy-900">Байгууллага</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label">Нэр</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} />
          </div>
          <div>
            <label className="label">Нэхэмжлэхийн prefix</label>
            <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} disabled={!isOwner} maxLength={8} />
            <p className="mt-1 text-[12px] text-muted">Жишээ: {prefix || 'INV'}-00042</p>
          </div>
        </div>
        {error && <ErrorNote message={error} />}
        {saved && <p className="text-sm font-semibold text-teal-600">✓ Хадгалагдлаа</p>}
        {isOwner && (
          <div className="flex justify-end">
            <button className="btn-primary min-w-[130px]" onClick={save} disabled={busy}>
              {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Хадгалах'}
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <h2 className="px-6 py-4 font-bold text-navy-900">Багийн гишүүд</h2>
        <table className="w-full border-t border-line">
          <thead className="bg-navy-50/60">
            <tr>
              <th className="th">Нэр</th>
              <th className="th">Имэйл</th>
              <th className="th">Эрх</th>
              <th className="th">Нэгдсэн</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {info.team.map((m) => (
              <tr key={m.id}>
                <td className="td font-medium">{m.user.name}</td>
                <td className="td text-muted">{m.user.email}</td>
                <td className="td">
                  <span className="rounded-full bg-navy-50 px-2.5 py-1 text-[12px] font-semibold text-navy-700">{ROLE_MN[m.role] ?? m.role}</span>
                </td>
                <td className="td text-muted">{shortDate(m.since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-6 py-4 text-[12.5px] text-muted">Гишүүн урих, эрх өөрчлөх — дараагийн хувилбарт.</p>
      </div>
    </div>
  );
}
