'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AdminGate, AdminHeader } from '@/components/admin';
import { EmptyState, ErrorNote, InvoiceBadge, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { mnt } from '@/lib/format';
import type { InvoiceState } from '@/lib/types';

interface Results {
  invoices: { id: string; number: string; amount: number; state: InvoiceState; tenant: string; customer: string }[];
  customers: { id: string; name: string; phoneMasked: string | null; tenant: string }[];
  transactions: { id: string; intentId: string; providerPaymentId: string; gross: number; status: string; invoice: string; tenant: string }[];
  tenants: { id: string; name: string; kybStatus: string }[];
}

export default function AdminSupportPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setBusy(true); setError(null);
    try {
      setResults(await api<Results>(`/admin/support/search?q=${encodeURIComponent(q.trim())}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Хайлт амжилтгүй');
    } finally { setBusy(false); }
  }

  const empty = results && !results.invoices.length && !results.customers.length && !results.transactions.length && !results.tenants.length;

  return (
    <AdminGate title="Хайлт">
      <div className="space-y-5">
        <AdminHeader title="🔎 Support хайлт" sub="Нэхэмжлэх, харилцагч, гүйлгээ, байгууллагаар — утасны дугаар нууцлагдаж харагдана (A-20)" />

        <form onSubmit={search} className="card flex gap-3 p-4">
          <input className="input" placeholder="Invoice №, нэр, утас, payment ID, байгууллага… (≥3 тэмдэгт)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <button type="submit" className="btn-primary min-w-[110px] shrink-0" disabled={busy || q.trim().length < 3}>
            {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Хайх'}
          </button>
        </form>

        {error && <ErrorNote message={error} />}
        {empty && <EmptyState title="Юу ч олдсонгүй" hint="Өөр түлхүүр үгээр оролдоно уу." />}

        {results && results.tenants.length > 0 && (
          <div className="card overflow-hidden">
            <h2 className="px-6 py-3.5 font-bold text-slate-900">🏢 Байгууллага</h2>
            <table className="w-full border-t border-slate-200/60"><tbody className="divide-y divide-slate-200/60">
              {results.tenants.map((t) => (
                <tr key={t.id}>
                  <td className="td"><Link href={`/admin/merchants/${t.id}`} className="font-bold text-indigo-600 hover:underline">{t.name}</Link></td>
                  <td className="td text-slate-500">{t.kybStatus}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}

        {results && results.invoices.length > 0 && (
          <div className="card overflow-hidden">
            <h2 className="px-6 py-3.5 font-bold text-slate-900">🧾 Нэхэмжлэх</h2>
            <table className="w-full border-t border-slate-200/60"><tbody className="divide-y divide-slate-200/60">
              {results.invoices.map((i) => (
                <tr key={i.id}>
                  <td className="td font-mono text-[12.5px] font-bold">{i.number}</td>
                  <td className="td">{i.customer}</td>
                  <td className="td text-slate-500">{i.tenant}</td>
                  <td className="td"><InvoiceBadge state={i.state} /></td>
                  <td className="td text-right font-semibold">{mnt(i.amount)}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}

        {results && results.customers.length > 0 && (
          <div className="card overflow-hidden">
            <h2 className="px-6 py-3.5 font-bold text-slate-900">👥 Харилцагч <span className="text-[12px] font-medium text-slate-400">(утас нууцлагдсан)</span></h2>
            <table className="w-full border-t border-slate-200/60"><tbody className="divide-y divide-slate-200/60">
              {results.customers.map((c) => (
                <tr key={c.id}>
                  <td className="td font-semibold">{c.name}</td>
                  <td className="td font-mono text-[13px]">{c.phoneMasked ?? '—'}</td>
                  <td className="td text-slate-500">{c.tenant}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}

        {results && results.transactions.length > 0 && (
          <div className="card overflow-hidden">
            <h2 className="px-6 py-3.5 font-bold text-slate-900">💳 Гүйлгээ</h2>
            <table className="w-full border-t border-slate-200/60"><tbody className="divide-y divide-slate-200/60">
              {results.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="td"><Link href={`/admin/transactions/${t.intentId}`} className="font-bold text-indigo-600 hover:underline">{t.invoice}</Link></td>
                  <td className="td max-w-[200px] truncate font-mono text-[12px] text-slate-500">{t.providerPaymentId}</td>
                  <td className="td text-slate-500">{t.tenant}</td>
                  <td className="td text-right font-semibold">{mnt(t.gross)}</td>
                  <td className="td text-[12.5px] font-bold">{t.status === 'REFUNDED' ? <span className="text-red-500">↩ Буцаагдсан</span> : <span className="text-emerald-600">✓</span>}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}
      </div>
    </AdminGate>
  );
}
