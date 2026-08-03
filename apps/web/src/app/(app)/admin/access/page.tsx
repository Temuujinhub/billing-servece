'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminGate, AdminHeader } from '@/components/admin';
import { ErrorNote, Modal, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';
import { shortDate } from '@/lib/format';

interface AdminRow { id: string; email: string; name: string; createdAt: string }

export default function AdminAccessPage() {
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const me = getSessionUser();

  const load = useCallback(() => {
    api<AdminRow[]>('/admin/access').then(setAdmins).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setAdmin(targetEmail: string, isAdmin: boolean) {
    setBusy(true); setError(null);
    try {
      setAdmins(await api<AdminRow[]>('/admin/access', { method: 'PUT', body: JSON.stringify({ email: targetEmail, isAdmin }) }));
      setGrantOpen(false);
      setEmail('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally { setBusy(false); }
  }

  return (
    <AdminGate title="Админ эрх">
      <div className="max-w-2xl space-y-5">
        <AdminHeader
          title="🔐 Админ эрхийн удирдлага"
          sub="Платформын админ хэн байхыг эндээс удирдана (A-22). Үйлдэл бүр audit-д үлдэнэ."
          action={<button className="btn-primary" onClick={() => setGrantOpen(true)}>+ Админ нэмэх</button>}
        />
        {error && <ErrorNote message={error} />}
        {!admins ? (
          <PageLoader />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead><tr><th className="th">Нэр</th><th className="th">Имэйл</th><th className="th">Нэмэгдсэн</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-slate-200/60">
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td className="td font-semibold">{a.name} {a.email === me?.email && <span className="text-[11.5px] font-bold text-indigo-600">(та)</span>}</td>
                    <td className="td text-slate-500">{a.email}</td>
                    <td className="td text-slate-500">{shortDate(a.createdAt)}</td>
                    <td className="td text-right">
                      {a.email !== me?.email && (
                        <button className="btn-danger px-3 py-1.5 text-[12.5px]" disabled={busy} onClick={() => setAdmin(a.email, false)}>
                          Эрх хасах
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[12.5px] leading-relaxed text-slate-500">
          💡 Нэмэх хэрэглэгч эхлээд системд бүртгүүлсэн байх ёстой. Серверийн <code className="rounded bg-white/70 px-1">ADMIN_EMAILS</code> болон{' '}
          <code className="rounded bg-white/70 px-1">ADMIN_BOOTSTRAP_*</code> env тохиргоо мөн админ эрх олгодог.
        </p>

        <Modal open={grantOpen} title="Админ эрх олгох" onClose={() => setGrantOpen(false)}>
          <p className="text-sm text-slate-500">Бүртгэлтэй хэрэглэгчийн имэйлийг оруулна уу. Тухайн хэрэглэгч дараагийн нэвтрэлтээсээ админ хэсгийг харна.</p>
          <input className="input mt-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.mn" />
          <div className="mt-4 flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setGrantOpen(false)}>Болих</button>
            <button className="btn-primary min-w-[120px]" disabled={busy || !email.includes('@')} onClick={() => setAdmin(email.trim(), true)}>
              {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Эрх олгох'}
            </button>
          </div>
        </Modal>
      </div>
    </AdminGate>
  );
}
