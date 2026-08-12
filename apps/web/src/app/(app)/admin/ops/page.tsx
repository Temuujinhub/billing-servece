'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AdminGate, AdminHeader } from '@/components/admin';
import { EmptyState, ErrorNote, PageLoader, ReceiptBadge, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dateTime, mnt, MESSAGE_STATE_MN } from '@/lib/format';

interface ReceiptRow {
  id: string; state: string; error: string | null; retries: number; createdAt: string;
  source: 'payment' | 'api' | 'pos'; amount: number | null; description: string | null; deviceId: string | null;
  /** Standalone (api/pos) баримтад NULL. */
  transaction: { gross: number; providerPaymentId: string; intent: { tenantId: string; invoice: { number: string; tenant: { name: string } } } } | null;
}

interface MessageRow {
  id: string; recipient: string; body: string; segments: number; status: string; error: string | null; createdAt: string;
  invoice: { number: string; tenant: { name: string } } | null;
}

interface EventOps {
  failedIntents: { id: string; createdAt: string; payload: any; intent: { id: string; invoice: { number: string } } }[];
  failedSms: number;
  failedReceipts: number;
}

type Tab = 'receipts' | 'messages' | 'failures';

export default function AdminOpsPage() {
  const [tab, setTab] = useState<Tab>('receipts');
  const [receipts, setReceipts] = useState<ReceiptRow[] | null>(null);
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [events, setEvents] = useState<EventOps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      api<ReceiptRow[]>('/admin/receipts'),
      api<MessageRow[]>('/admin/messages'),
      api<EventOps>('/admin/event-ops'),
    ])
      .then(([r, m, e]) => { setReceipts(r); setMessages(m); setEvents(e); })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function retry(kind: 'receipts' | 'messages', id: string) {
    setBusyId(id);
    try {
      await api(`/admin/${kind}/${id}/retry`, { method: 'POST' });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Retry амжилтгүй');
    } finally { setBusyId(null); }
  }

  const TABS: { key: Tab; label: string; count: number | null }[] = [
    { key: 'receipts', label: '🧿 eBarimt дараалал (A-10)', count: receipts?.length ?? null },
    { key: 'messages', label: '💬 SMS дараалал (A-11)', count: messages?.length ?? null },
    { key: 'failures', label: '⚠️ Бүх алдаа (A-18)', count: events ? events.failedIntents.length : null },
  ];

  return (
    <AdminGate title="Ops дараалал">
      <div className="space-y-5">
        <AdminHeader title="🚦 Ops дараалал" sub="Гацсан eBarimt, SMS, provider алдаанууд — нэг дороос retry" />
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`rounded-full px-4 py-2 text-[13.5px] font-bold transition ${tab === t.key ? 'bg-slate-900 text-white' : 'bg-white/60 text-slate-600 hover:bg-white'}`}>
              {t.label}{t.count !== null ? ` · ${t.count}` : ''}
            </button>
          ))}
        </div>

        {error && <ErrorNote message={error} />}
        {!receipts || !messages || !events ? (
          <PageLoader />
        ) : tab === 'receipts' ? (
          receipts.length === 0 ? (
            <EmptyState title="Гацсан eBarimt алга 🎉" hint="PENDING/FAILED/CANCEL_PENDING баримт байхгүй." />
          ) : (
            <div className="card overflow-hidden">
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead><tr><th className="th">Огноо</th><th className="th">Байгууллага</th><th className="th">Нэхэмжлэх</th><th className="th text-right">Дүн</th><th className="th">Төлөв</th><th className="th">Алдаа</th><th className="th" /></tr></thead>
                  <tbody className="divide-y divide-slate-200/60">
                    {receipts.map((r) => (
                      <tr key={r.id}>
                        <td className="td whitespace-nowrap text-slate-500">{dateTime(r.createdAt)}</td>
                        <td className="td">{r.transaction?.intent.invoice.tenant.name ?? '—'}</td>
                        <td className="td">
                          {r.transaction ? (
                            <span className="font-mono text-[12.5px]">{r.transaction.intent.invoice.number}</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[12.5px] text-slate-600">
                              {r.description ?? r.deviceId ?? '—'}
                              <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-bold text-navy-700">{r.source === 'pos' ? 'POS' : 'API'}</span>
                            </span>
                          )}
                        </td>
                        <td className="td text-right font-semibold">{r.transaction ? mnt(r.transaction.gross) : r.amount != null ? mnt(r.amount) : '—'}</td>
                        <td className="td"><ReceiptBadge state={r.state} /><p className="text-[11px] text-slate-400">retry: {r.retries}</p></td>
                        <td className="td max-w-[220px] truncate text-[12px] text-red-500" title={r.error ?? ''}>{r.error ?? '—'}</td>
                        <td className="td">
                          <button className="btn-secondary px-3 py-1.5 text-[12.5px]" disabled={busyId === r.id} onClick={() => retry('receipts', r.id)}>
                            {busyId === r.id ? <Spinner className="h-4 w-4" /> : '↻ Retry'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : tab === 'messages' ? (
          messages.length === 0 ? (
            <EmptyState title="Гацсан SMS алга 🎉" hint="FAILED/QUEUED мессеж байхгүй." />
          ) : (
            <div className="card overflow-hidden">
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead><tr><th className="th">Огноо</th><th className="th">Байгууллага</th><th className="th">Хүлээн авагч</th><th className="th">Төлөв</th><th className="th">Алдаа</th><th className="th" /></tr></thead>
                  <tbody className="divide-y divide-slate-200/60">
                    {messages.map((m) => (
                      <tr key={m.id}>
                        <td className="td whitespace-nowrap text-slate-500">{dateTime(m.createdAt)}</td>
                        <td className="td">{m.invoice?.tenant.name ?? '—'}</td>
                        <td className="td font-mono text-[12.5px]">{m.recipient} <span className="text-slate-400">({m.segments} seg)</span></td>
                        <td className="td">
                          <span className={`text-[12.5px] font-bold ${m.status === 'FAILED' ? 'text-red-600' : 'text-amber-600'}`}>{MESSAGE_STATE_MN[m.status] ?? m.status}</span>
                        </td>
                        <td className="td max-w-[240px] truncate text-[12px] text-red-500" title={m.error ?? ''}>{m.error ?? '—'}</td>
                        <td className="td">
                          {m.status === 'FAILED' && (
                            <button className="btn-secondary px-3 py-1.5 text-[12.5px]" disabled={busyId === m.id} onClick={() => retry('messages', m.id)}>
                              {busyId === m.id ? <Spinner className="h-4 w-4" /> : '↻ Retry'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="card p-5"><p className="text-[13px] font-semibold text-slate-500">Provider intent алдаа</p><p className="mt-1 text-2xl font-extrabold">{events.failedIntents.length}</p></div>
              <div className="card p-5"><p className="text-[13px] font-semibold text-slate-500">SMS алдаа</p><p className="mt-1 text-2xl font-extrabold">{events.failedSms}</p></div>
              <div className="card p-5"><p className="text-[13px] font-semibold text-slate-500">eBarimt гацсан</p><p className="mt-1 text-2xl font-extrabold">{events.failedReceipts}</p></div>
            </div>
            {events.failedIntents.length === 0 ? (
              <EmptyState title="Provider алдаа алга 🎉" />
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead><tr><th className="th">Огноо</th><th className="th">Нэхэмжлэх</th><th className="th">Алдаа</th></tr></thead>
                  <tbody className="divide-y divide-slate-200/60">
                    {events.failedIntents.map((e) => (
                      <tr key={e.id}>
                        <td className="td whitespace-nowrap text-slate-500">{dateTime(e.createdAt)}</td>
                        <td className="td"><Link href={`/admin/transactions/${e.intent.id}`} className="font-bold text-indigo-600 hover:underline">{e.intent.invoice.number}</Link></td>
                        <td className="td max-w-[380px] truncate font-mono text-[12px] text-red-500">{e.payload?.error ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminGate>
  );
}
