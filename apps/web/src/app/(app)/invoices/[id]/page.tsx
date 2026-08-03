'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, InvoiceBadge, Modal, PageLoader, ReceiptBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dateTime, mnt, shortDate, MESSAGE_STATE_MN } from '@/lib/format';
import type { InvoiceDetail } from '@/lib/types';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payUrl, setPayUrl] = useState<string | null>(null);

  const load = useCallback(() => {
    api<InvoiceDetail>(`/invoices/${id}`).then(setInv).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ payUrl: string }>(`/invoices/${id}/send`, { method: 'POST' });
      setPayUrl(res.payUrl);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api(`/invoices/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'UI cancel' }) });
      setCancelOpen(false);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
      setCancelOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (error && !inv) return <ErrorNote message={error} />;
  if (!inv) return <PageLoader />;

  const paidAmount = inv.amount - inv.balance;
  const canSend = ['DRAFT', 'SENT', 'VIEWED', 'OVERDUE', 'PARTIALLY_PAID'].includes(inv.state);
  const canCancel = ['DRAFT', 'SENT', 'VIEWED', 'OVERDUE'].includes(inv.state) && paidAmount === 0;

  // Unified chronological timeline (UX §12.1 — auditability).
  const timeline: { ts: string; label: string; tone?: string }[] = [];
  timeline.push({ ts: inv.createdAt, label: 'Нэхэмжлэх үүсгэсэн' });
  if (inv.sentAt) timeline.push({ ts: inv.sentAt, label: 'Илгээсэн (SMS + линк)' });
  for (const job of inv.messageJobs) {
    timeline.push({ ts: job.createdAt, label: `SMS → ${job.recipient} · ${job.segments} segment · ${MESSAGE_STATE_MN[job.status] ?? job.status}` });
  }
  for (const intent of inv.intents) {
    for (const ev of intent.events) {
      timeline.push({
        ts: ev.createdAt,
        label:
          ev.type === 'payment.succeeded'
            ? 'Төлбөр амжилттай баталгаажлаа'
            : ev.type === 'intent.created'
              ? 'Төлбөрийн QR үүсгэсэн'
              : ev.type,
        tone: ev.type === 'payment.succeeded' ? 'text-teal-700' : undefined,
      });
    }
  }
  if (inv.cancelledAt) timeline.push({ ts: inv.cancelledAt, label: 'Цуцалсан', tone: 'text-red-600' });
  timeline.sort((a, b) => a.ts.localeCompare(b.ts));

  const receipt = inv.intents.flatMap((i) => i.transactions).flatMap((t) => t.receipts)[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/invoices" className="text-[13.5px] font-semibold text-teal-600 hover:text-teal-700">
            ← Нэхэмжлэх рүү буцах
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{inv.number}</h1>
            <InvoiceBadge state={inv.state} />
          </div>
          <p className="mt-1 text-sm text-muted">{inv.description}</p>
        </div>
        <div className="flex gap-3">
          {canSend && (
            <button onClick={resend} disabled={busy} className="btn-primary">
              {inv.state === 'DRAFT' ? 'Илгээх' : 'Дахин илгээх / сануулах'}
            </button>
          )}
          {canCancel && (
            <button onClick={() => setCancelOpen(true)} disabled={busy} className="btn-danger">
              Цуцлах
            </button>
          )}
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {payUrl && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          Шинэ линк илгээгдлээ: <a href={payUrl} target="_blank" rel="noreferrer" className="break-all font-semibold underline">{payUrl}</a>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Amount card */}
        <div className="card p-6">
          <p className="text-[13px] font-medium text-muted">Нийт дүн</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-navy-900">{mnt(inv.amount)}</p>
          <div className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between"><span className="text-muted">Төлсөн</span><b className="text-teal-600">{mnt(paidAmount)}</b></div>
            <div className="flex justify-between"><span className="text-muted">Үлдэгдэл</span><b>{mnt(inv.balance)}</b></div>
            <div className="flex justify-between"><span className="text-muted">Дуусах хугацаа</span><span>{shortDate(inv.dueDate)}</span></div>
          </div>
          {receipt && (
            <div className="mt-4 rounded-xl bg-navy-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold text-navy-800">eBarimt</p>
                <ReceiptBadge state={receipt.state} />
              </div>
              {receipt.receiptNo && <p className="mt-2 break-all font-mono text-[12px] text-navy-600">{receipt.receiptNo}</p>}
              {receipt.lottery && <p className="mt-1 text-[13px]">Сугалаа: <b className="tracking-widest">{receipt.lottery}</b></p>}
            </div>
          )}
        </div>

        {/* Customer */}
        <div className="card p-6">
          <h2 className="font-bold text-navy-900">Төлөгч</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-lg font-semibold text-navy-900">
              <Link href={`/customers/${inv.customer.id}`} className="hover:text-teal-700 hover:underline">{inv.customer.name}</Link>
            </p>
            <p className="text-muted">{inv.customer.phone ?? 'Утасгүй'}</p>
            {inv.customer.email && <p className="text-muted">{inv.customer.email}</p>}
            {inv.customer.externalRef && <p className="text-[12.5px] text-navy-400">Код: {inv.customer.externalRef}</p>}
          </div>
          <h3 className="mt-5 border-t border-line pt-4 text-[13px] font-bold text-navy-800">Линкүүд</h3>
          <ul className="mt-2 space-y-1.5 text-[13px] text-muted">
            {inv.shortLinks.map((l) => (
              <li key={l.id} className="flex justify-between">
                <span>{shortDate(l.createdAt)} · {l.revokedAt ? 'хүчингүй' : 'идэвхтэй'}</span>
                <span>{l.clicks} нээлт</span>
              </li>
            ))}
            {inv.shortLinks.length === 0 && <li>Линк үүсээгүй</li>}
          </ul>
        </div>

        {/* Timeline */}
        <div className="card p-6">
          <h2 className="font-bold text-navy-900">Түүх</h2>
          <ol className="mt-4 space-y-3 border-l-2 border-line pl-4">
            {timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-teal-400 ring-4 ring-white" />
                <p className={`text-[13.5px] font-medium ${t.tone ?? 'text-navy-800'}`}>{t.label}</p>
                <p className="text-[12px] text-muted">{dateTime(t.ts)}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <Modal open={cancelOpen} title="Нэхэмжлэх цуцлах уу?" onClose={() => setCancelOpen(false)}>
        <p className="text-sm text-muted">
          <b className="text-navy-900">{inv.number}</b> ({mnt(inv.amount)}) цуцлагдана. Идэвхтэй төлбөрийн линкүүд хүчингүй болно.
          Энэ үйлдэл буцаагдахгүй.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setCancelOpen(false)}>Болих</button>
          <button className="btn-danger" onClick={cancel} disabled={busy}>Тийм, цуцлах</button>
        </div>
      </Modal>
    </div>
  );
}
