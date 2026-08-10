'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminGate, AdminHeader } from '@/components/admin';
import { EmptyState, ErrorNote, Modal, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dateTime } from '@/lib/format';

interface Incident {
  id: string; title: string; severity: string; status: string; note: string | null;
  createdBy: string | null; createdAt: string; resolvedAt: string | null;
}

const SEV_TONE: Record<string, string> = {
  SEV1: 'bg-red-100/80 text-red-700 ring-red-300',
  SEV2: 'bg-orange-100/80 text-orange-700 ring-orange-300',
  SEV3: 'bg-amber-100/80 text-amber-700 ring-amber-300',
  SEV4: 'bg-slate-100/80 text-slate-600 ring-slate-300',
};

const STATUS_MN: Record<string, string> = { OPEN: 'Нээлттэй', MONITORING: 'Хянаж буй', RESOLVED: 'Шийдэгдсэн' };

export default function AdminIncidentsPage() {
  const [items, setItems] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: '', severity: 'SEV3', note: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Incident[]>('/admin/incidents').then(setItems).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true); setError(null);
    try {
      await api('/admin/incidents', { method: 'POST', body: JSON.stringify(form) });
      setCreateOpen(false);
      setForm({ title: '', severity: 'SEV3', note: '' });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally { setBusy(false); }
  }

  async function setStatus(id: string, status: string) {
    try {
      await api(`/admin/incidents/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    }
  }

  return (
    <AdminGate title="Incident">
      <div className="space-y-5">
        <AdminHeader
          title="🚨 Incident management"
          sub="Системийн доголдлыг зарлах, хянах, шийдвэрлэх (A-19)"
          action={<button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Incident зарлах</button>}
        />
        {error && <ErrorNote message={error} />}
        {!items ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <EmptyState title="Incident алга 🎉" hint="Системд бүртгэлтэй доголдол байхгүй." />
        ) : (
          <div className="space-y-3">
            {items.map((i) => (
              <div key={i.id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-black ring-1 ring-inset ${SEV_TONE[i.severity] ?? SEV_TONE.SEV4}`}>{i.severity}</span>
                    <p className="font-bold text-slate-900">{i.title}</p>
                  </div>
                  {i.note && <p className="mt-1 text-[13px] text-slate-500">{i.note}</p>}
                  <p className="mt-1 text-[12px] text-slate-400">
                    {i.createdBy} · {dateTime(i.createdAt)}{i.resolvedAt ? ` · шийдэгдсэн ${dateTime(i.resolvedAt)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(['OPEN', 'MONITORING', 'RESOLVED'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatus(i.id, s)}
                      className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold transition ${
                        i.status === s
                          ? s === 'RESOLVED' ? 'bg-emerald-600 text-white' : s === 'OPEN' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
                          : 'bg-white/60 text-slate-500 hover:bg-white'
                      }`}
                    >
                      {STATUS_MN[s]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <Modal open={createOpen} title="Incident зарлах" onClose={() => setCreateOpen(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">Гарчиг</label>
              <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Жишээ: QPay callback саатаж байна" />
            </div>
            <div>
              <label className="label">Хүндрэлийн зэрэг</label>
              <select className="input" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
                <option value="SEV1">SEV1 — Систем бүрэн зогссон</option>
                <option value="SEV2">SEV2 — Гол функц доголдсон</option>
                <option value="SEV3">SEV3 — Хэсэгчилсэн доголдол</option>
                <option value="SEV4">SEV4 — Бага зэргийн</option>
              </select>
            </div>
            <div>
              <label className="label">Тэмдэглэл</label>
              <textarea className="input min-h-[70px]" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Болих</button>
              <button className="btn-primary min-w-[120px]" disabled={busy || !form.title.trim()} onClick={create}>
                {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Зарлах'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </AdminGate>
  );
}
