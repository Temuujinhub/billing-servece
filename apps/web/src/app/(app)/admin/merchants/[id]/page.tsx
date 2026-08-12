'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AdminGate, KybPill } from '@/components/admin';
import { ErrorNote, InvoiceBadge, Modal, PageLoader, Spinner, Stat } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dateTime, mnt, shortDate } from '@/lib/format';
import type { InvoiceState } from '@/lib/types';

interface Merchant360 {
  tenant: {
    id: string; name: string; regNo: string | null; status: string; kybStatus: string;
    contactEmail: string | null; contactPhone: string | null; createdAt: string;
    modules: { code: string; enabled: boolean; quantity: number; unitPrice: number | null; tier: number | null }[];
    memberships: { id: string; role: string; user: { id: string; name: string; email: string; platformAdmin: boolean } }[];
    _count: { invoices: number; customers: number; batches: number };
  };
  stats: { invoicedTotal: number; outstanding: number; collected: number; payments: number };
  providers: { qpay: { enabled: boolean; source: string }; callpro: { enabled: boolean; source: string } };
  recentInvoices: { id: string; number: string; amount: number; state: InvoiceState; createdAt: string; customer: { name: string } }[];
  recentAudit: { id: string; actorEmail: string | null; action: string; createdAt: string }[];
}

const KYB_ACTIONS: { action: string; label: string; needsReason: boolean; cls: string }[] = [
  { action: 'APPROVE', label: '✅ Баталгаажуулах', needsReason: false, cls: 'btn-primary' },
  { action: 'UNDER_REVIEW', label: '🔍 Хянаж эхлэх', needsReason: false, cls: 'btn-secondary' },
  { action: 'NEEDS_INFO', label: '📩 Мэдээлэл нэхэх', needsReason: true, cls: 'btn-secondary' },
  { action: 'REJECT', label: '❌ Татгалзах', needsReason: true, cls: 'btn-danger' },
];

const MODULE_LABEL: Record<string, string> = {
  EXCEL_SMS: 'Excel/UI нэхэмжлэх+SMS',
  API_SMS: 'API нэхэмжлэх+SMS',
  EBARIMT_API: 'eBarimt API',
  POS_EBARIMT: 'POS терминал',
  EBARIMT: 'eBarimt холболт (дотоод)',
  REMINDER: 'Сануулга',
};

/** Гэрээт нэгж үнэтэй байж болох үйлчилгээнүүд. */
const UNIT_PRICE_CODES = ['EXCEL_SMS', 'API_SMS'] as const;

export default function AdminMerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Merchant360 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reasonModal, setReasonModal] = useState<{ action: string; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api<Merchant360>(`/admin/merchants/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function kyb(action: string, reasonText?: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/merchants/${id}/kyb`, { method: 'POST', body: JSON.stringify({ action, reason: reasonText }) });
      setReasonModal(null);
      setReason('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function toggleModule(code: string, enabled: boolean) {
    setBusy(true);
    try {
      await api(`/admin/merchants/${id}/modules/${code}`, { method: 'POST', body: JSON.stringify({ enabled }) });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  /** Гэрээт үнэ / шатлал хадгалах — PUT /admin/merchants/:id/pricing/:code. */
  async function savePricing(code: string, body: { unitPrice?: number | null; tier?: number | null }) {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/merchants/${id}/pricing/${code}`, { method: 'PUT', body: JSON.stringify(body) });
      setPriceDrafts((d) => {
        const next = { ...d };
        delete next[code];
        return next;
      });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminGate title="Байгууллагын дэлгэрэнгүй">
      {error && !data ? (
        <ErrorNote message={error} />
      ) : !data ? (
        <PageLoader />
      ) : (
        <div className="space-y-6">
          <div>
            <Link href="/admin/merchants" className="text-[13.5px] font-semibold text-indigo-600 hover:text-indigo-700">← Байгууллагууд руу буцах</Link>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{data.tenant.name}</h1>
              <KybPill status={data.tenant.kybStatus} />
              {data.tenant.status === 'SUSPENDED' && <span className="rounded-full bg-red-50/80 px-2.5 py-1 text-[12px] font-bold text-red-600 ring-1 ring-inset ring-red-200">Түдгэлзсэн</span>}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Регистр: {data.tenant.regNo ?? '—'} · {data.tenant.contactEmail ?? ''} · {data.tenant.contactPhone ?? ''} · Бүртгүүлсэн {shortDate(data.tenant.createdAt)}
            </p>
          </div>

          {error && <ErrorNote message={error} />}

          {/* KYB actions (A-06) */}
          <div className="card flex flex-wrap items-center gap-3 p-5">
            <p className="mr-2 text-[13px] font-bold uppercase tracking-wide text-slate-500">KYB шийдвэр:</p>
            {KYB_ACTIONS.map((a) => (
              <button
                key={a.action}
                disabled={busy}
                className={`${a.cls} px-3.5 py-2 text-[13px]`}
                onClick={() => (a.needsReason ? setReasonModal({ action: a.action, label: a.label }) : kyb(a.action))}
              >
                {a.label}
              </button>
            ))}
            <span className="mx-2 h-6 w-px bg-slate-300/60" />
            {data.tenant.status === 'ACTIVE' ? (
              <button disabled={busy} className="btn-danger px-3.5 py-2 text-[13px]" onClick={() => setReasonModal({ action: 'SUSPEND', label: 'Түдгэлзүүлэх' })}>
                ⛔ Түдгэлзүүлэх
              </button>
            ) : (
              <button disabled={busy} className="btn-primary px-3.5 py-2 text-[13px]" onClick={() => kyb('ACTIVATE')}>
                ▶ Идэвхжүүлэх
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Нийт нэхэмжилсэн" value={mnt(data.stats.invoicedTotal)} sub={`${data.tenant._count.invoices} нэхэмжлэх`} />
            <Stat label="Цугласан" value={mnt(data.stats.collected)} sub={`${data.stats.payments} төлөлт`} tone="positive" />
            <Stat label="Авлагын үлдэгдэл" value={mnt(data.stats.outstanding)} />
            <Stat label="Харилцагч / Импорт" value={`${data.tenant._count.customers} / ${data.tenant._count.batches}`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Modules + providers (A-17 per-tenant) */}
            <div className="card p-6">
              <h2 className="font-bold text-slate-900">Модуль & Provider</h2>
              <div className="mt-4 space-y-3">
                {data.tenant.modules.map((m) => {
                  const editableUnit = (UNIT_PRICE_CODES as readonly string[]).includes(m.code);
                  const draft = priceDrafts[m.code] ?? (m.unitPrice != null ? String(m.unitPrice) : '');
                  return (
                    <div key={m.code} className="rounded-2xl border border-white/80 bg-white/50 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-800">{MODULE_LABEL[m.code] ?? m.code}{m.quantity > 1 ? ` × ${m.quantity}` : ''}</span>
                        <button
                          role="switch"
                          aria-checked={m.enabled}
                          disabled={busy}
                          onClick={() => toggleModule(m.code, !m.enabled)}
                          className={`relative h-6 w-11 rounded-full transition ${m.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                        >
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${m.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                        </button>
                      </div>
                      {editableUnit && (
                        <div className="mt-2.5 flex items-end gap-2 border-t border-slate-200/60 pt-2.5">
                          <div className="flex-1">
                            <label className="label" htmlFor={`price-${m.code}`}>Гэрээт үнэ ₮/илгээлт <span className="text-slate-400">(хоосон = глобал үнэ)</span></label>
                            <input
                              id={`price-${m.code}`}
                              className="input"
                              inputMode="numeric"
                              value={draft}
                              placeholder="глобал тариф"
                              onChange={(e) => setPriceDrafts((d) => ({ ...d, [m.code]: e.target.value.replace(/\D/g, '') }))}
                            />
                          </div>
                          <button
                            className="btn-secondary px-3.5 py-2 text-[13px]"
                            disabled={busy}
                            onClick={() => savePricing(m.code, { unitPrice: draft === '' ? null : Number(draft) })}
                          >
                            Хадгалах
                          </button>
                        </div>
                      )}
                      {m.code === 'EBARIMT_API' && (
                        <div className="mt-2.5 border-t border-slate-200/60 pt-2.5">
                          <label className="label" htmlFor="ebarimt-api-tier">eBarimt API шатлал</label>
                          <select
                            id="ebarimt-api-tier"
                            className="input"
                            disabled={busy}
                            value={m.tier ?? 1}
                            onChange={(e) => savePricing(m.code, { tier: Number(e.target.value) })}
                          >
                            <option value={1}>Шатлал 1 (сард ≤500 баримт)</option>
                            <option value={2}>Шатлал 2 (сард ≤2000 баримт)</option>
                            <option value={3}>Шатлал 3 (хязгааргүй)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-4 border-t border-slate-200/60 pt-4 text-[13px]">
                <span className={data.providers.qpay.enabled ? 'font-bold text-emerald-600' : 'text-slate-400'}>
                  QPay: {data.providers.qpay.enabled ? 'холбогдсон' : 'идэвхгүй'} ({data.providers.qpay.source})
                </span>
                <span className={data.providers.callpro.enabled ? 'font-bold text-emerald-600' : 'text-slate-400'}>
                  CallPro: {data.providers.callpro.enabled ? 'холбогдсон' : 'идэвхгүй'} ({data.providers.callpro.source})
                </span>
              </div>
            </div>

            {/* Team */}
            <div className="card overflow-hidden">
              <h2 className="px-6 py-4 font-bold text-slate-900">Гишүүд</h2>
              <table className="w-full border-t border-slate-200/60">
                <tbody className="divide-y divide-slate-200/60">
                  {data.tenant.memberships.map((m) => (
                    <tr key={m.id}>
                      <td className="td font-semibold">{m.user.name}</td>
                      <td className="td text-slate-500">{m.user.email}</td>
                      <td className="td"><span className="rounded-full bg-white/70 px-2.5 py-1 text-[12px] font-bold text-slate-600 ring-1 ring-inset ring-slate-200">{m.role}</span></td>
                      <td className="td">{m.user.platformAdmin && <span className="text-[12px] font-bold text-amber-600">🛡 админ</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card overflow-hidden">
              <h2 className="px-6 py-4 font-bold text-slate-900">Сүүлийн нэхэмжлэхүүд</h2>
              <table className="w-full border-t border-slate-200/60">
                <tbody className="divide-y divide-slate-200/60">
                  {data.recentInvoices.map((i) => (
                    <tr key={i.id}>
                      <td className="td font-mono text-[12.5px]">{i.number}</td>
                      <td className="td">{i.customer.name}</td>
                      <td className="td"><InvoiceBadge state={i.state} /></td>
                      <td className="td text-right font-semibold">{mnt(i.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card overflow-hidden">
              <h2 className="px-6 py-4 font-bold text-slate-900">Байгууллагын audit</h2>
              <table className="w-full border-t border-slate-200/60">
                <tbody className="divide-y divide-slate-200/60">
                  {data.recentAudit.map((a) => (
                    <tr key={a.id}>
                      <td className="td whitespace-nowrap text-slate-500">{dateTime(a.createdAt)}</td>
                      <td className="td">{a.actorEmail ?? 'систем'}</td>
                      <td className="td font-mono text-[12px]">{a.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Modal open={!!reasonModal} title={reasonModal?.label ?? ''} onClose={() => setReasonModal(null)}>
            <p className="text-sm text-slate-500">Шалтгаанаа бичнэ үү — audit бүртгэлд үлдэнэ (заавал).</p>
            <textarea className="input mt-3 min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Шалтгаан…" />
            <div className="mt-4 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setReasonModal(null)}>Болих</button>
              <button className="btn-primary min-w-[120px]" disabled={busy || !reason.trim()} onClick={() => kyb(reasonModal!.action, reason)}>
                {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Баталгаажуулах'}
              </button>
            </div>
          </Modal>
        </div>
      )}
    </AdminGate>
  );
}
