'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AdminGate } from '@/components/admin';
import { ErrorNote, InvoiceBadge, Modal, PageLoader, ReceiptBadge, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dateTime, mnt } from '@/lib/format';
import type { InvoiceState } from '@/lib/types';

interface Forensic {
  id: string;
  provider: string;
  state: string;
  amount: number;
  providerInvoiceId: string | null;
  createdAt: string;
  invoice: {
    id: string; number: string; amount: number; balance: number; state: InvoiceState;
    customer: { name: string; phone: string | null };
    tenant: { id: string; name: string };
  };
  transactions: {
    id: string; providerPaymentId: string; gross: number; fee: number; status: string;
    paidAt: string; refundedAt: string | null; refundReason: string | null;
    receipts: { id: string; state: string; receiptNo: string | null; lottery: string | null }[];
  }[];
  events: { id: string; type: string; payload: any; createdAt: string }[];
}

export default function AdminTransactionForensicPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Forensic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [refundTx, setRefundTx] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    api<Forensic>(`/admin/transactions/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function recheck() {
    setBusy(true); setError(null); setNote(null);
    try {
      const r = await api<{ state: string; verified?: boolean }>(`/admin/transactions/${id}/recheck`, { method: 'POST' });
      setNote(r.state === 'SUCCEEDED' ? '✅ Provider дээр төлөгдсөн — ledger шинэчлэгдлээ.' : `ℹ Provider шалгалт: төлөв ${r.state}, төлөлт олдсонгүй.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally { setBusy(false); }
  }

  async function refund() {
    if (!refundTx) return;
    setBusy(true); setError(null);
    try {
      await api(`/admin/transactions/tx/${refundTx}/refund`, { method: 'POST', body: JSON.stringify({ reason }) });
      setRefundTx(null); setReason('');
      setNote('↩ Буцаалт амжилттай — ledger, нэхэмжлэх, eBarimt шинэчлэгдлээ.');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Буцаалт амжилтгүй');
    } finally { setBusy(false); }
  }

  return (
    <AdminGate title="Гүйлгээний дэлгэрэнгүй">
      {error && !data ? <ErrorNote message={error} /> : !data ? <PageLoader /> : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/admin/transactions" className="text-[13.5px] font-semibold text-indigo-600 hover:text-indigo-700">← Гүйлгээнүүд рүү буцах</Link>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
                {data.invoice.number} · {mnt(data.amount)}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                <Link href={`/admin/merchants/${data.invoice.tenant.id}`} className="font-semibold text-indigo-600 hover:underline">{data.invoice.tenant.name}</Link>
                {' '}· Төлөгч: {data.invoice.customer.name} · Provider: {data.provider === 'qpay' ? 'QPay' : 'Mock'} · Intent {data.state}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={recheck} disabled={busy} className="btn-secondary">
                {busy ? <Spinner className="h-4 w-4" /> : '🔄 Provider-ээс дахин шалгах'}
              </button>
            </div>
          </div>

          {error && <ErrorNote message={error} />}
          {note && <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/70 px-4 py-3 text-sm font-medium text-indigo-800 backdrop-blur-md">{note}</div>}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Ledger */}
            <div className="card p-6">
              <h2 className="font-bold text-slate-900">Ledger</h2>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Нэхэмжлэхийн дүн</span><b>{mnt(data.invoice.amount)}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Үлдэгдэл</span><b>{mnt(data.invoice.balance)}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Нэхэмжлэхийн төлөв</span><InvoiceBadge state={data.invoice.state} /></div>
                <div className="flex justify-between"><span className="text-slate-500">Provider invoice ID</span><span className="max-w-[220px] truncate font-mono text-[12px]">{data.providerInvoiceId ?? '—'}</span></div>
              </div>

              <h3 className="mt-5 border-t border-slate-200/60 pt-4 text-[13px] font-bold uppercase tracking-wide text-slate-500">Гүйлгээнүүд</h3>
              <div className="mt-2 space-y-3">
                {data.transactions.length === 0 && <p className="text-sm text-slate-400">Баталгаажсан гүйлгээ алга.</p>}
                {data.transactions.map((t) => (
                  <div key={t.id} className="rounded-2xl border border-white/80 bg-white/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className={`font-extrabold ${t.status === 'REFUNDED' ? 'text-red-500 line-through' : 'text-emerald-600'}`}>{mnt(t.gross)}</span>
                      <span className="text-[12px] text-slate-500">{dateTime(t.paidAt)}</span>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11.5px] text-slate-500">{t.providerPaymentId}</p>
                    {t.receipts[0] && (
                      <div className="mt-2 flex items-center gap-2 text-[12.5px]">
                        <ReceiptBadge state={t.receipts[0].state} />
                        {t.receipts[0].lottery && <span className="font-mono">{t.receipts[0].lottery}</span>}
                      </div>
                    )}
                    {t.status === 'REFUNDED' ? (
                      <p className="mt-2 text-[12.5px] text-red-500">↩ Буцаагдсан {t.refundedAt ? dateTime(t.refundedAt) : ''} — {t.refundReason}</p>
                    ) : (
                      <button className="btn-danger mt-3 px-3 py-1.5 text-[12.5px]" disabled={busy} onClick={() => setRefundTx(t.id)}>
                        ↩ Буцаалт хийх
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Event timeline (A-08) */}
            <div className="card p-6">
              <h2 className="font-bold text-slate-900">Event timeline</h2>
              <ol className="mt-4 space-y-3 border-l-2 border-slate-200/70 pl-4">
                <li className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-400 ring-4 ring-white" />
                  <p className="text-[13.5px] font-semibold text-slate-800">Intent үүссэн</p>
                  <p className="text-[12px] text-slate-500">{dateTime(data.createdAt)}</p>
                </li>
                {data.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${
                      e.type.includes('succeeded') ? 'bg-emerald-500' : e.type.includes('failed') || e.type.includes('refund') ? 'bg-red-400' : 'bg-slate-300'
                    }`} />
                    <p className="text-[13.5px] font-semibold text-slate-800">{e.type}</p>
                    <p className="text-[12px] text-slate-500">{dateTime(e.createdAt)}</p>
                    {e.payload && <p className="mt-0.5 max-w-full break-all font-mono text-[11px] text-slate-400">{JSON.stringify(e.payload).slice(0, 160)}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <Modal open={!!refundTx} title="Төлбөр буцаах уу?" onClose={() => setRefundTx(null)}>
            <p className="text-sm text-slate-500">
              Provider дээр бодит буцаалт хийгдэж, ledger + нэхэмжлэхийн үлдэгдэл + eBarimt цуцлагдана. Энэ үйлдэл audit-д бүртгэгдэнэ.
            </p>
            <textarea className="input mt-3 min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Буцаалтын шалтгаан (заавал)…" />
            <div className="mt-4 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setRefundTx(null)}>Болих</button>
              <button className="btn-danger min-w-[140px]" disabled={busy || !reason.trim()} onClick={refund}>
                {busy ? <Spinner className="h-4 w-4" /> : 'Тийм, буцаах'}
              </button>
            </div>
          </Modal>
        </div>
      )}
    </AdminGate>
  );
}
