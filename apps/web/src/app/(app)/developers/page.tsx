'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorNote, Modal, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';
import { dateTime, shortDate } from '@/lib/format';
import type { DevelopersOverview } from '@/lib/types';

const EVENTS = ['payment.succeeded', 'receipt.created'];

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl bg-navy-900 p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-navy-300">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-white/10 px-3 py-2.5 font-mono text-[13px] text-teal-300">{value}</code>
        <button
          className="btn-secondary shrink-0 px-3 py-1.5 text-[12.5px]"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? '✓ Хуулсан' : 'Хуулах'}
        </button>
      </div>
      <p className="mt-2 text-[12px] text-amber-300">⚠ Энэ нууц зөвхөн одоо нэг удаа харагдана — аюулгүй газар хадгална уу.</p>
    </div>
  );
}

export default function DevelopersPage() {
  const [data, setData] = useState<DevelopersOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = getSessionUser()?.role === 'OWNER';

  const [keyModal, setKeyModal] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);

  const [hookModal, setHookModal] = useState(false);
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>(EVENTS);
  const [newHookSecret, setNewHookSecret] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<DevelopersOverview>('/developers').then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createKey() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ key: unknown; secret: string }>('/developers/keys', {
        method: 'POST',
        body: JSON.stringify({ name: keyName.trim() }),
      });
      setNewKeySecret(res.secret);
      setKeyName('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: string) {
    if (!window.confirm('Энэ түлхүүрийг хүчингүй болгох уу? Ашиглаж буй интеграци ажиллахаа болино.')) return;
    try {
      await api(`/developers/keys/${id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function createHook() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ endpoint: unknown; secret: string }>('/developers/webhooks', {
        method: 'POST',
        body: JSON.stringify({ url: hookUrl.trim(), events: hookEvents }),
      });
      setNewHookSecret(res.secret);
      setHookUrl('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function deleteHook(id: string) {
    if (!window.confirm('Энэ endpoint-ыг устгах уу?')) return;
    try {
      await api(`/developers/webhooks/${id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <PageLoader />;

  const activeKeys = data.keys.filter((k) => !k.revokedAt);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">API & Webhooks</h1>
        <p className="mt-1 text-sm text-slate-500">Гадны системээс нэхэмжлэх үүсгэх Partner API түлхүүр ба төлбөрийн webhook мэдэгдэл</p>
      </div>

      {error && <ErrorNote message={error} />}
      {!isOwner && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] font-medium text-amber-800">
          Түлхүүр үүсгэх, webhook удирдах эрх зөвхөн эзэмшигчид бий.
        </p>
      )}

      {/* API keys */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h2 className="font-bold text-slate-900">API түлхүүр</h2>
            <p className="text-[12.5px] text-slate-500">{activeKeys.length}/5 идэвхтэй · X-Api-Key толгойгоор илгээнэ</p>
          </div>
          {isOwner && (
            <button className="btn-primary px-4 py-2 text-[13.5px]" onClick={() => setKeyModal(true)} disabled={activeKeys.length >= 5}>
              + Түлхүүр үүсгэх
            </button>
          )}
        </div>
        {data.keys.length === 0 ? (
          <div className="border-t border-slate-200/60 p-6">
            <EmptyState title="Түлхүүр алга" hint="Partner API ашиглахын тулд эхний түлхүүрээ үүсгээрэй." />
          </div>
        ) : (
          <table className="w-full border-t border-slate-200/60">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="th">Нэр</th>
                <th className="th">Түлхүүр</th>
                <th className="th">Үүссэн</th>
                <th className="th">Төлөв</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {data.keys.map((k) => (
                <tr key={k.id} className={k.revokedAt ? 'opacity-50' : ''}>
                  <td className="td font-medium">{k.name}</td>
                  <td className="td font-mono text-[13px] text-slate-500">{k.prefix}…{k.last4}</td>
                  <td className="td text-slate-500">{shortDate(k.createdAt)}</td>
                  <td className="td">
                    {k.revokedAt ? (
                      <span className="rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-semibold text-red-600">Хүчингүй</span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700">Идэвхтэй</span>
                    )}
                  </td>
                  <td className="td text-right">
                    {isOwner && !k.revokedAt && (
                      <button className="text-[13px] font-semibold text-red-600 hover:underline" onClick={() => revokeKey(k.id)}>
                        Хүчингүй болгох
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Webhooks */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h2 className="font-bold text-slate-900">Webhook endpoint</h2>
            <p className="text-[12.5px] text-slate-500">Төлбөр амжилттай болмогц таны сервер лүү HMAC гарын үсэгтэй POST илгээнэ</p>
          </div>
          {isOwner && (
            <button className="btn-primary px-4 py-2 text-[13.5px]" onClick={() => setHookModal(true)} disabled={data.webhooks.length >= 5}>
              + Endpoint нэмэх
            </button>
          )}
        </div>
        {data.webhooks.length === 0 ? (
          <div className="border-t border-slate-200/60 p-6">
            <EmptyState title="Endpoint алга" hint="payment.succeeded, receipt.created event-үүдийг хүлээн авах URL-ээ нэмээрэй." />
          </div>
        ) : (
          <table className="w-full border-t border-slate-200/60">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="th">URL</th>
                <th className="th">Events</th>
                <th className="th">Сүүлийн илгээлт</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {data.webhooks.map((w) => (
                <tr key={w.id}>
                  <td className="td max-w-[280px] truncate font-mono text-[13px]">{w.url}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {w.events.map((ev) => (
                        <span key={ev} className="rounded-full bg-navy-50 px-2 py-0.5 text-[11.5px] font-semibold text-navy-700">{ev}</span>
                      ))}
                    </div>
                  </td>
                  <td className="td text-slate-500">
                    {w.lastAt ? (
                      <>
                        <span className={w.lastStatus && w.lastStatus < 300 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                          HTTP {w.lastStatus ?? '—'}
                        </span>{' '}
                        · {dateTime(w.lastAt)}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="td text-right">
                    {isOwner && (
                      <button className="text-[13px] font-semibold text-red-600 hover:underline" onClick={() => deleteHook(w.id)}>
                        Устгах
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick docs */}
      <div className="card space-y-4 p-6">
        <h2 className="font-bold text-slate-900">Partner API — түргэн заавар</h2>
        <div className="rounded-xl bg-navy-900 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-navy-300">Нэхэмжлэх үүсгээд SMS илгээх</p>
          <pre className="scroll-thin mt-2 overflow-x-auto rounded-lg bg-white/10 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-teal-200">{`curl -X POST https://billing.mastrsys.com/api/v1/partner/invoices \\
  -H "X-Api-Key: bsk_ТАНЫ_ТҮЛХҮҮР" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customerName": "Бат Болд",
    "customerPhone": "99112233",
    "description": "9-р сарын төлбөр",
    "amount": 150000,
    "dueDate": "2026-09-01",
    "send": true
  }'`}</pre>
        </div>
        <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-slate-600">
          <li>• <b>GET /api/v1/partner/invoices/:id</b> — төлөв шалгах (state, balance, paidAt).</li>
          <li>• Webhook бүр <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">X-Billing-Signature</code> толгойтой — whsec_ нууцаар HMAC-SHA256 баталгаажуулна.</li>
          <li>• Webhook хүлээн авсныг 2xx статусаар хариулна; амжилтгүй бол 1 удаа дахин оролдоно.</li>
        </ul>
      </div>

      {/* Create key modal */}
      <Modal
        open={keyModal}
        title={newKeySecret ? 'Түлхүүр үүслээ' : 'API түлхүүр үүсгэх'}
        onClose={() => {
          setKeyModal(false);
          setNewKeySecret(null);
        }}
      >
        {newKeySecret ? (
          <div className="space-y-4">
            <CopyField value={newKeySecret} label="API түлхүүр (bsk_…)" />
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => { setKeyModal(false); setNewKeySecret(null); }}>Хадгалсан, хаах</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label">Нэр (юунд ашиглах вэ)</label>
              <input className="input" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Ж: ERP интеграци" maxLength={80} />
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setKeyModal(false)}>Болих</button>
              <button className="btn-primary min-w-[120px]" onClick={createKey} disabled={busy || !keyName.trim()}>
                {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Үүсгэх'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create webhook modal */}
      <Modal
        open={hookModal}
        title={newHookSecret ? 'Endpoint нэмэгдлээ' : 'Webhook endpoint нэмэх'}
        onClose={() => {
          setHookModal(false);
          setNewHookSecret(null);
        }}
      >
        {newHookSecret ? (
          <div className="space-y-4">
            <CopyField value={newHookSecret} label="Гарын үсгийн нууц (whsec_…)" />
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => { setHookModal(false); setNewHookSecret(null); }}>Хадгалсан, хаах</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label">HTTPS URL</label>
              <input className="input" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://tanai-server.mn/webhooks/billing" maxLength={300} />
            </div>
            <div>
              <label className="label">Events</label>
              <div className="flex gap-2">
                {EVENTS.map((ev) => {
                  const on = hookEvents.includes(ev);
                  return (
                    <button
                      key={ev}
                      type="button"
                      onClick={() => setHookEvents((cur) => (on ? cur.filter((e) => e !== ev) : [...cur, ev]))}
                      className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${
                        on ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600'
                      }`}
                    >
                      {ev}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setHookModal(false)}>Болих</button>
              <button className="btn-primary min-w-[120px]" onClick={createHook} disabled={busy || !hookUrl.trim() || hookEvents.length === 0}>
                {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Нэмэх'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
