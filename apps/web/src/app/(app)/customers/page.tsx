'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorNote, Modal, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { shortDate } from '@/lib/format';
import type { Customer } from '@/lib/types';

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', externalRef: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams({ take: '100' });
    if (query) params.set('search', query);
    api<{ items: Customer[]; total: number }>(`/customers?${params}`)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError(e.message));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          externalRef: form.externalRef.trim() || undefined,
        }),
      });
      setAddOpen(false);
      setForm({ name: '', phone: '', email: '', externalRef: '' });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Харилцагч</h1>
          <p className="mt-1 text-sm text-slate-500">{total.toLocaleString()} бүртгэл</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn-primary">+ Харилцагч</button>
      </div>

      <form
        className="card flex gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
        }}
      >
        <input className="input" placeholder="Нэр, утас, имэйл, кодоор хайх…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Хайлт" />
        <button type="submit" className="btn-secondary shrink-0">Хайх</button>
      </form>

      {error && <ErrorNote message={error} onRetry={() => window.location.reload()} />}
      {!items ? (
        error ? null : <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState title="Харилцагч алга" hint="Excel импорт хийхэд харилцагчид автоматаар үүснэ." />
      ) : (
        <div className="card overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="th">Нэр</th>
                  <th className="th">Утас</th>
                  <th className="th">Имэйл</th>
                  <th className="th">Код</th>
                  <th className="th text-right">Нэхэмжлэх</th>
                  <th className="th">Бүртгэсэн</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {items.map((c) => (
                  <tr key={c.id} className="transition hover:bg-white/60">
                    <td className="td">
                      <Link href={`/customers/${c.id}`} className="font-semibold text-indigo-700 hover:underline">{c.name}</Link>
                    </td>
                    <td className="td font-mono text-[13px]">{c.phone ?? '—'}</td>
                    <td className="td text-slate-500">{c.email ?? '—'}</td>
                    <td className="td text-slate-500">{c.externalRef ?? '—'}</td>
                    <td className="td text-right font-semibold">{c._count?.invoices ?? 0}</td>
                    <td className="td text-slate-500">{shortDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={addOpen} title="Шинэ харилцагч" onClose={() => setAddOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="label">Нэр</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Утас</label>
              <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="88112233" />
            </div>
            <div>
              <label className="label">Код</label>
              <input className="input" value={form.externalRef} onChange={(e) => setForm((f) => ({ ...f, externalRef: e.target.value }))} placeholder="ST-1001" />
            </div>
          </div>
          <div>
            <label className="label">Имэйл</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setAddOpen(false)}>Болих</button>
            <button className="btn-primary min-w-[120px]" onClick={create} disabled={busy || !form.name.trim()}>
              {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Хадгалах'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
