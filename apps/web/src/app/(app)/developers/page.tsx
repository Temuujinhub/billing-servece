'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorNote, Modal, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';
import { dateTime, shortDate } from '@/lib/format';
import type { ApiKeyScope, DevelopersOverview } from '@/lib/types';

const EVENTS = ['payment.succeeded', 'receipt.created', 'receipt.cancelled'];

const EVENT_DESC: Record<string, string> = {
  'payment.succeeded': 'Нэхэмжлэхийн төлбөр амжилттай төлөгдөв',
  'receipt.created': 'eBarimt баримт ТЕГ-т амжилттай үүсэв',
  'receipt.cancelled': 'eBarimt баримт цуцлагдав',
};

const WEBHOOK_SAMPLE = `POST https://tanai-server.mn/webhooks/billing
Content-Type: application/json
X-Billing-Event: receipt.created
X-Billing-Signature: 3f1a9c… (HMAC-SHA256)

{
  "event": "receipt.created",
  "created_at": "2026-08-19T09:30:00.000Z",
  "data": {
    "receipt_id": "rcp_7f3a…",
    "transaction_id": "txn_91bc…",
    "receipt_no": "0000123456",
    "lottery": "AB12345678"
  }
}`;

const SCOPES: { value: ApiKeyScope; label: string }[] = [
  { value: 'invoice', label: 'Нэхэмжлэх API (Үйлчилгээ 2)' },
  { value: 'receipt', label: 'eBarimt API (Үйлчилгээ 3)' },
  { value: 'pos', label: 'POS терминал (Үйлчилгээ 4)' },
];

const SCOPE_BADGE: Record<string, string> = { invoice: 'Нэхэмжлэх', receipt: 'eBarimt', pos: 'POS' };

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
  const [keyScopes, setKeyScopes] = useState<ApiKeyScope[]>(['invoice']);
  const [keyTestMode, setKeyTestMode] = useState(false);
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);

  const [hookModal, setHookModal] = useState(false);
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>(EVENTS);
  const [newHookSecret, setNewHookSecret] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [docsTab, setDocsTab] = useState<'invoice' | 'receipt' | 'pos'>('invoice');

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
        body: JSON.stringify({ name: keyName.trim(), scopes: keyScopes, mode: keyTestMode ? 'test' : 'live' }),
      });
      setNewKeySecret(res.secret);
      setKeyName('');
      setKeyScopes(['invoice']);
      setKeyTestMode(false);
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
                <th className="th">Эрх / Горим</th>
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
                  <td className="td">
                    <div className="flex flex-wrap items-center gap-1">
                      {(k.scopes ?? []).length === 0 ? (
                        <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[11.5px] font-semibold text-navy-700">Бүх эрх</span>
                      ) : (
                        k.scopes.map((s) => (
                          <span key={s} className="rounded-full bg-navy-50 px-2 py-0.5 text-[11.5px] font-semibold text-navy-700">
                            {SCOPE_BADGE[s] ?? s}
                          </span>
                        ))
                      )}
                      {k.mode === 'test' && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11.5px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">Тест</span>
                      )}
                    </div>
                  </td>
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
            <EmptyState title="Endpoint алга" hint="payment.succeeded, receipt.created, receipt.cancelled event-үүдийг хүлээн авах URL-ээ нэмээрэй." />
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
        {/* Webhook формат — B-66 */}
        <div className="space-y-3 border-t border-slate-200/60 px-6 py-5">
          <h3 className="text-[13.5px] font-bold text-slate-900">Webhook формат</h3>
          <p className="text-[13px] leading-relaxed text-slate-600">
            Event болмогц таны URL руу JSON биетэй <b>POST</b> илгээнэ. Биет нь{' '}
            <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12px]">event</code>,{' '}
            <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12px]">created_at</code>,{' '}
            <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12px]">data</code> гэсэн 3 талбартай.
          </p>
          <div className="rounded-xl bg-navy-900 p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-navy-300">Жишээ илгээлт</p>
            <pre className="scroll-thin mt-2 overflow-x-auto rounded-lg bg-white/10 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-teal-200">{WEBHOOK_SAMPLE}</pre>
          </div>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-slate-600">
            {EVENTS.map((ev) => (
              <li key={ev}>
                • <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12px]">{ev}</code> — {EVENT_DESC[ev]}.
              </li>
            ))}
            <li>
              • <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12px]">payment.succeeded</code>-ийн data:
              invoice_id, invoice_number, amount, provider, provider_payment_id, invoice_state;{' '}
              <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12px]">receipt.cancelled</code>-ийн data: receipt_id, receipt_no.
            </li>
            <li>
              • <b>Гарын үсэг:</b> <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12px]">X-Billing-Signature</code> =
              HMAC-SHA256(биетийн түүхий текст, whsec_ нууц), hex хэлбэрээр. Нууцыг endpoint нэмэхэд нэг л удаа харуулна.
            </li>
            <li>
              • <b>Хариу:</b> 10 секундэд 2xx буцаана — амжилтгүй бол 1 удаа шууд дахин илгээнэ (at-least-once тул давхардлыг
              receipt_id/invoice_id-аар шүүнэ). Redirect дагахгүй.
            </li>
          </ul>
        </div>
      </div>

      {/* Quick docs — үйлчилгээ тус бүрээр таб */}
      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-slate-900">Partner API — түргэн заавар</h2>
          <a
            href="/billingservice-partner-api.postman_collection.json"
            download
            className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-[13px]"
          >
            ⬇ Postman collection
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'invoice', label: 'Үйлчилгээ 2 — API нэхэмжлэх + SMS' },
            { key: 'receipt', label: 'Үйлчилгээ 3 — eBarimt API' },
            { key: 'pos', label: 'Үйлчилгээ 4 — POS терминал' },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setDocsTab(t.key)}
              className={`rounded-full px-4 py-2 text-[13px] font-bold transition ${
                docsTab === t.key ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-700 hover:bg-navy-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {docsTab === 'invoice' && (
          <div className="space-y-4">
            <p className="text-[13.5px] leading-relaxed text-slate-600">
              Өөрийн системээс нэхэмжлэх үүсгээд төлбөрийн линкийг SMS-ээр илгээнэ. Илгээлт бүр гэрээт үнээр
              тоологдоно; төлбөр орж ирэхэд eBarimt автоматаар үүснэ. Шаардлагатай эрх: <b>invoice</b>.
            </p>
            <div className="rounded-xl bg-navy-900 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-navy-300">Нэхэмжлэх үүсгээд SMS илгээх</p>
              <pre className="scroll-thin mt-2 overflow-x-auto rounded-lg bg-white/10 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-teal-200">{`curl -X POST https://msgbill.mn/api/v1/partner/invoices \\
  -H "X-Api-Key: bsk_ТАНЫ_ТҮЛХҮҮР" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-10041" \\
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
              <li>• <b>GET /api/v1/partner/invoices/:id</b> — төлөв шалгах (state, balance, paid_at, receipt).</li>
              <li>• Төлбөр амжилттай болмогц <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">payment.succeeded</code>, баримт үүсмэгц <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">receipt.created</code> webhook ирнэ.</li>
              <li>• Webhook бүр <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">X-Billing-Signature</code> толгойтой — whsec_ нууцаар HMAC-SHA256 баталгаажуулна; 2xx-ээр хариулна.</li>
            </ul>
          </div>
        )}

        {docsTab === 'receipt' && (
          <div className="space-y-4">
            <p className="text-[13.5px] leading-relaxed text-slate-600">
              Өөрийн системийн борлуулалтад НӨАТ-ын баримтыг шууд үүсгэнэ — нэхэмжлэх/төлбөрийн урсгал шаардлагагүй.
              Сарын баримтын тоо сонгосон шатлалаар хязгаарлагдана (Billing хуудас). Шаардлагатай эрх: <b>receipt</b>.
            </p>
            <div className="rounded-xl bg-navy-900 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-navy-300">Баримт үүсгэх</p>
              <pre className="scroll-thin mt-2 overflow-x-auto rounded-lg bg-white/10 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-teal-200">{`curl -X POST https://msgbill.mn/api/v1/partner/receipts \\
  -H "X-Api-Key: bsk_ТАНЫ_ТҮЛХҮҮР" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-10041" \\
  -d '{
    "amount": 45000,
    "description": "Худалдан авалт #10041",
    "receipt_type": "CITIZEN",
    "payment_method": "CARD"
  }'`}</pre>
            </div>
            <div className="rounded-xl bg-navy-900 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-navy-300">Хариу (201)</p>
              <pre className="scroll-thin mt-2 overflow-x-auto rounded-lg bg-white/10 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-teal-200">{`{
  "id": "rcp_7f3a…",
  "state": "CREATED",
  "receipt_no": "0000123456",
  "lottery": "AB12345678",
  "qr_data": "…",
  "receipt_type": "CITIZEN",
  "error": null
}`}</pre>
            </div>
            <div className="rounded-xl bg-navy-900 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-navy-300">Баримт цуцлах</p>
              <pre className="scroll-thin mt-2 overflow-x-auto rounded-lg bg-white/10 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-teal-200">{`curl -X POST https://msgbill.mn/api/v1/partner/receipts/rcp_7f3a…/cancel \\
  -H "X-Api-Key: bsk_ТАНЫ_ТҮЛХҮҮР"`}</pre>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-navy-300">Хариу (200)</p>
              <pre className="scroll-thin mt-2 overflow-x-auto rounded-lg bg-white/10 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-teal-200">{`{
  "id": "rcp_7f3a…",
  "state": "CANCELLED",
  "receipt_no": "0000123456",
  "error": null
}`}</pre>
            </div>
            <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-slate-600">
              <li>• <b>POST /api/v1/partner/receipts/:id/cancel</b> — ТЕГ-т илгээгдсэн баримтыг цуцалж буцаана. ТЕГ түр амжилтгүй бол <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">{'state: "CANCEL_PENDING"'}</code> + <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">error</code> ирнэ — систем 10 минут тутам автоматаар дахин оролдоно; эцсийн үр дүнг GET-ээр эсвэл <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">receipt.cancelled</code> webhook-оор мэднэ.</li>
              <li>• <b>GET /api/v1/partner/receipts/:id</b> — баримтын төлөв (state, receipt_no, lottery, qr_data).</li>
              <li>• <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">receipt_type</code>: CITIZEN | ORGANIZATION — ААН-ийн баримтад <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">payer_reg_no</code> дамжуулна: төлөгч байгууллагын ТТД (11-14 орон) эсвэл регистр (7 орон) — регистр өгвөл ТТД-г ТЕГ-ийн лавлагаагаар автоматаар олно.</li>
              <li>• <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">payment_method</code>: CASH | CARD | BANK_TRANSFER.</li>
              <li>• Хязгаар дүүрвэл 429 <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">RECEIPT_QUOTA_EXCEEDED</code> — Billing хуудаснаас шатлалаа ахиулна.</li>
            </ul>
          </div>
        )}

        {docsTab === 'pos' && (
          <div className="space-y-4">
            <p className="text-[13.5px] leading-relaxed text-slate-600">
              POS/кассын апп-аас баримт үүсгэнэ. <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">device_id</code>{' '}
              дамжуулснаар терминал <b>автоматаар бүртгэгдэж</b> тоологдоно — баримтын тоон хязгааргүй, сарын хураамж
              идэвхтэй терминалын тооноос бодогдоно. Шаардлагатай эрх: <b>pos</b>.
            </p>
            <div className="rounded-xl bg-navy-900 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-navy-300">POS-оос баримт үүсгэх</p>
              <pre className="scroll-thin mt-2 overflow-x-auto rounded-lg bg-white/10 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-teal-200">{`curl -X POST https://msgbill.mn/api/v1/partner/receipts \\
  -H "X-Api-Key: bsk_ТАНЫ_ТҮЛХҮҮР" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pos-7788-000123" \\
  -d '{
    "amount": 12500,
    "description": "Кассын борлуулалт",
    "payment_method": "CASH",
    "device_id": "POS-7788",
    "device_name": "Салбар 1 касс"
  }'`}</pre>
            </div>
            <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-slate-600">
              <li>• <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">device_id</code> — төхөөрөмжийн давтагдашгүй дугаар (серийн №, IMEI г.м.); эхний баримтаар автоматаар бүртгэгдэнэ.</li>
              <li>• Терминалуудыг Billing хуудасны «POS терминал» хэсэгт харж, блоклож болно — блоклогдсон терминалд 403 <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-[12.5px]">TERMINAL_BLOCKED</code>.</li>
              <li>• Баримтын бүтэц, хариу нь Үйлчилгээ 3-тай ижил (receipt_no, lottery, qr_data).</li>
            </ul>
          </div>
        )}

        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-900">
          💡 Туршилт: «Тест түлхүүр» (bsk_test_…) юу ч бичихгүй — симуляц хариу буцаана. Заавар:{' '}
          <code className="rounded bg-white/60 px-1.5 py-0.5 font-mono text-[12px]">docs/API_TESTING.md</code>
        </p>
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
            <div>
              <label className="label">Эрх (scope)</label>
              <div className="space-y-2">
                {SCOPES.map((s) => {
                  const on = keyScopes.includes(s.value);
                  return (
                    <label key={s.value} className="flex cursor-pointer items-center gap-3 rounded-xl bg-navy-50/60 px-3.5 py-2.5 text-[13.5px] font-medium text-navy-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-indigo-600"
                        checked={on}
                        onChange={() => setKeyScopes((cur) => (on ? cur.filter((v) => v !== s.value) : [...cur, s.value]))}
                      />
                      {s.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3.5 py-2.5 text-[13.5px] font-medium text-amber-900">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-amber-600"
                checked={keyTestMode}
                onChange={(e) => setKeyTestMode(e.target.checked)}
              />
              <span>
                Тест түлхүүр
                <span className="mt-0.5 block text-[12px] font-normal text-amber-800">
                  Тест түлхүүр юу ч бичихгүй — симуляц хариу буцаана. Postman collection-оор турших боломжтой.
                </span>
              </span>
            </label>
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
              <div className="flex flex-wrap gap-2">
                {EVENTS.map((ev) => {
                  const on = hookEvents.includes(ev);
                  return (
                    <button
                      key={ev}
                      type="button"
                      title={EVENT_DESC[ev]}
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
              <ul className="mt-2 space-y-0.5 text-[12px] leading-relaxed text-slate-500">
                {EVENTS.map((ev) => (
                  <li key={ev}>
                    <code className="font-mono">{ev}</code> — {EVENT_DESC[ev]}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-navy-50/70 px-3.5 py-3 text-[12.5px] leading-relaxed text-navy-800">
              Илгээлт: JSON биетэй POST —{' '}
              <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-[11.5px]">{'{ "event", "created_at", "data" }'}</code>.
              Толгойд <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-[11.5px]">X-Billing-Signature</code> (whsec_
              нууцаар HMAC-SHA256) ирнэ; 10 секундэд 2xx буцаана. Дэлгэрэнгүй форматыг доорх «Webhook формат» хэсгээс харна уу.
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
