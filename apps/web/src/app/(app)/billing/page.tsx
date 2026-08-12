'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';
import { mnt, shortDate } from '@/lib/format';
import type { BillingOverview, EbarimtTier, TenantModuleInfo } from '@/lib/types';

/** 4 үндсэн үйлчилгээ — тарифын загвар v2 (суурь хураамжгүй, НӨАТ нэмж тооцно). */
const SERVICE_CODES = ['EXCEL_SMS', 'API_SMS', 'EBARIMT_API', 'POS_EBARIMT'] as const;

function tierLabel(t: EbarimtTier, i: number): string {
  return `Шатлал ${i + 1} — сард ${t.upTo ? `≤${t.upTo.toLocaleString()}` : 'хязгааргүй'} баримт · ${mnt(t.fee)}/сар`;
}

export default function BillingPage() {
  const [data, setData] = useState<BillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [terminalBusy, setTerminalBusy] = useState<string | null>(null);
  const isOwner = getSessionUser()?.role === 'OWNER';

  const load = useCallback(() => {
    api<BillingOverview>('/billing').then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setModule(code: string, enabled: boolean, tier?: number) {
    setToggling(code);
    setError(null);
    try {
      await api(`/billing/modules/${code}`, {
        method: 'POST',
        body: JSON.stringify(tier !== undefined ? { enabled, tier } : { enabled }),
      });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setToggling(null);
    }
  }

  async function setTerminalStatus(id: string, status: 'ACTIVE' | 'BLOCKED') {
    setTerminalBusy(id);
    setError(null);
    try {
      await api(`/billing/pos-terminals/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setTerminalBusy(null);
    }
  }

  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <PageLoader />;

  const { pricing, usage } = data;
  const mod = (code: string): TenantModuleInfo | undefined => data.modules.find((m) => m.code === code);
  const excelMod = mod('EXCEL_SMS');
  const apiMod = mod('API_SMS');
  const ebApiMod = mod('EBARIMT_API');
  const posMod = mod('POS_EBARIMT');
  const reminderMod = mod('REMINDER');
  const currentTier = ebApiMod?.tier && ebApiMod.tier >= 1 && ebApiMod.tier <= pricing.EBARIMT_API_TIERS.length ? ebApiMod.tier : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Үйлчилгээ ба тооцоо</h1>
        <p className="mt-1 text-sm text-slate-500">
          Мөчлөг: {shortDate(data.cycleStart)}-оос хойш · Суурь хураамжгүй — хэрэглэсэн үйлчилгээгээ л төлнө · Бүх хураамжид НӨАТ {pricing.VAT_PERCENT}% нэмж тооцно
        </p>
      </div>

      {error && <ErrorNote message={error} />}
      {!isOwner && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] font-medium text-amber-800">
          Үйлчилгээ асаах/унтраах эрх зөвхөн эзэмшигчид бий.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Үйлчилгээ 1: Excel/дашбоард нэхэмжлэх + SMS */}
          <ServiceCard
            no="1"
            title="Excel/дашбоард нэхэмжлэх + SMS"
            desc="Excel импорт болон дашбоардаас нэхэмжлэх үүсгэж, төлбөрийн линкийг SMS-ээр илгээнэ. Нэг илгээлтэд ~2 SMS segment багтсан, eBarimt мөн багтсан."
            price={
              excelMod?.unitPrice != null
                ? `Танай гэрээт үнэ: ${mnt(excelMod.unitPrice)}/илгээлт`
                : `${mnt(pricing.INVOICE_MSG)}/илгээлт (eBarimt багтсан)`
            }
            module={excelMod}
            canToggle={isOwner}
            busy={toggling === 'EXCEL_SMS'}
            onToggle={(en) => setModule('EXCEL_SMS', en)}
          />

          {/* Үйлчилгээ 2: API нэхэмжлэх + SMS */}
          <ServiceCard
            no="2"
            title="API нэхэмжлэх + SMS"
            desc="Өөрийн системээс Partner API-аар нэхэмжлэх үүсгэж SMS-ээр илгээнэ. Үнэ tenant бүрд тохиролцооны дагуу."
            price={
              apiMod?.unitPrice != null
                ? `Танай гэрээт үнэ: ${mnt(apiMod.unitPrice)}/илгээлт`
                : `${mnt(pricing.API_INVOICE_MSG)}/илгээлт (үндсэн тариф)`
            }
            module={apiMod}
            canToggle={isOwner}
            busy={toggling === 'API_SMS'}
            onToggle={(en) => setModule('API_SMS', en)}
          />

          {/* Үйлчилгээ 3: eBarimt API */}
          <div className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-bold text-slate-900">
                  <span className="mr-1.5 text-[12px] font-black tracking-widest text-navy-300">3</span>
                  eBarimt API (өөрийн системд)
                </p>
                <p className="mt-0.5 text-[13.5px] text-slate-500">
                  Өөрийн POS/системээс API-аар НӨАТ-ын баримт үүсгэнэ. Шатлалын сарын хураамжтай.
                </p>
                <p className="mt-1 text-[12.5px] font-semibold text-indigo-600">
                  Нэг удаагийн интеграцийн хураамж {mnt(pricing.EBARIMT_API_ONBOARDING)} + шатлалын сарын хураамж
                </p>
              </div>
              <Toggle
                enabled={Boolean(ebApiMod?.enabled)}
                disabled={!isOwner || toggling === 'EBARIMT_API'}
                onClick={() => setModule('EBARIMT_API', !ebApiMod?.enabled, currentTier)}
                ownerOnlyHint={!isOwner}
              />
            </div>
            <div className="mt-4 space-y-2">
              {pricing.EBARIMT_API_TIERS.map((t, i) => {
                const selected = currentTier === i + 1;
                return (
                  <label
                    key={i}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-[13.5px] font-medium transition ${
                      selected ? 'border-indigo-300 bg-indigo-50/60 text-indigo-800' : 'border-slate-200/80 bg-white/50 text-slate-600'
                    } ${!isOwner ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <input
                      type="radio"
                      name="ebarimt-tier"
                      className="h-4 w-4 accent-indigo-600"
                      checked={selected}
                      disabled={!isOwner || toggling === 'EBARIMT_API'}
                      onChange={() => setModule('EBARIMT_API', Boolean(ebApiMod?.enabled), i + 1)}
                    />
                    {tierLabel(t, i)}
                  </label>
                );
              })}
            </div>
            <p className="mt-3 rounded-lg bg-navy-50 px-3.5 py-2.5 text-[13px] text-navy-700">
              Энэ сарын хэрэглээ: <b>{usage.apiReceipts.toLocaleString()}</b> /{' '}
              {usage.apiReceiptLimit ? usage.apiReceiptLimit.toLocaleString() : 'хязгааргүй'} баримт
            </p>
          </div>

          {/* Үйлчилгээ 4: POS терминал eBarimt */}
          <div className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-bold text-slate-900">
                  <span className="mr-1.5 text-[12px] font-black tracking-widest text-navy-300">4</span>
                  POS терминал eBarimt
                </p>
                <p className="mt-0.5 text-[13.5px] text-slate-500">
                  Терминал device_id-аараа автоматаар бүртгэгдэнэ. Баримтын тоо хязгааргүй — идэвхтэй төхөөрөмжөөр тооцно.
                </p>
                <p className="mt-1 text-[12.5px] font-semibold text-indigo-600">
                  {mnt(pricing.POS_PER_DEVICE)}/сар · идэвхтэй терминал бүрд
                </p>
              </div>
              <Toggle
                enabled={Boolean(posMod?.enabled)}
                disabled={!isOwner || toggling === 'POS_EBARIMT'}
                onClick={() => setModule('POS_EBARIMT', !posMod?.enabled)}
                ownerOnlyHint={!isOwner}
              />
            </div>
            <p className="mt-3 text-[13px] font-semibold text-navy-700">
              Энэ сард идэвхтэй терминал: {usage.activeTerminals.toLocaleString()}
            </p>
            {data.terminals.length > 0 && (
              <div className="scroll-thin mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="th">Төхөөрөмж</th>
                      <th className="th">Нэр</th>
                      <th className="th text-right">Баримт</th>
                      <th className="th">Сүүлд идэвхтэй</th>
                      <th className="th">Төлөв</th>
                      {isOwner && <th className="th" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60">
                    {data.terminals.map((t) => (
                      <tr key={t.id} className={t.status === 'BLOCKED' ? 'opacity-60' : ''}>
                        <td className="td font-mono text-[12.5px]">{t.deviceId}</td>
                        <td className="td">{t.name ?? '—'}</td>
                        <td className="td text-right font-semibold">{t.receiptCount.toLocaleString()}</td>
                        <td className="td text-slate-500">{shortDate(t.lastSeenAt)}</td>
                        <td className="td">
                          {t.status === 'BLOCKED' ? (
                            <span className="rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-semibold text-red-600">Блоклогдсон</span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700">Идэвхтэй</span>
                          )}
                        </td>
                        {isOwner && (
                          <td className="td text-right">
                            <button
                              className={`text-[13px] font-semibold hover:underline ${t.status === 'BLOCKED' ? 'text-emerald-600' : 'text-red-600'}`}
                              disabled={terminalBusy === t.id}
                              onClick={() => setTerminalStatus(t.id, t.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED')}
                            >
                              {terminalBusy === t.id ? '…' : t.status === 'BLOCKED' ? 'Идэвхжүүлэх' : 'Блоклох'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Туслах: автомат сануулга */}
          <div className="card flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-bold text-slate-900">Автомат сануулга</p>
              <p className="mt-0.5 text-[12.5px] text-slate-500">
                Хугацаа хэтэрсэн нэхэмжлэхэд автомат SMS сануулга — илгээлт бүр үйлчилгээнийхээ үнээр
              </p>
            </div>
            <Toggle
              enabled={Boolean(reminderMod?.enabled)}
              disabled={!isOwner || toggling === 'REMINDER'}
              onClick={() => setModule('REMINDER', !reminderMod?.enabled)}
              ownerOnlyHint={!isOwner}
            />
          </div>

          {/* Usage meters */}
          <div className="card p-5">
            <h2 className="font-bold text-slate-900">Энэ мөчлөгийн хэрэглээ</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Meter label="Excel/UI илгээлт" value={usage.invoiceMsgsExcel} />
              <Meter label="API илгээлт" value={usage.invoiceMsgsApi} />
              <Meter label="eBarimt API баримт" value={usage.apiReceipts} />
              <Meter label="Идэвхтэй терминал" value={usage.activeTerminals} />
              <Meter label="SMS segment" value={usage.smsSegments} />
            </div>
          </div>

          {/* Past bills */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4">
              <h2 className="font-bold text-slate-900">Өмнөх саруудын тооцоо</h2>
              <p className="text-[12.5px] text-slate-500">Сар хаагдмагц НӨАТ-тэй нэхэмжлэх SMS-ээр илгээгдэнэ</p>
            </div>
            {data.bills.length === 0 ? (
              <p className="border-t border-slate-200/60 px-6 py-5 text-[13.5px] text-slate-500">Хаагдсан мөчлөг алга — эхний тооцоо сарын эцэст үүснэ.</p>
            ) : (
              <table className="w-full border-t border-slate-200/60">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="th">Мөчлөг</th>
                    <th className="th text-right">Нийт (НӨАТ-тэй)</th>
                    <th className="th">Төлөв</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {data.bills.map((b) => (
                    <tr key={b.id}>
                      <td className="td font-mono text-[13px]">{b.cycle}</td>
                      <td className="td text-right font-semibold">{mnt(b.total)}</td>
                      <td className="td">
                        {b.status === 'INVOICED' ? (
                          <span className="text-[12.5px] font-semibold text-emerald-700">Нэхэмжлэх SMS-ээр илгээгдсэн</span>
                        ) : (
                          <span className="text-[12.5px] font-semibold text-slate-500">Тооцоо үүссэн</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Estimate */}
        <div className="card h-fit p-6">
          <h2 className="font-bold text-slate-900">Сарын урьдчилсан нэхэмжлэх</h2>
          <div className="mt-4 space-y-3 text-sm">
            {data.estimate.lines.length === 0 && <p className="text-[13px] text-slate-500">Энэ сард төлбөртэй хэрэглээ гараагүй байна.</p>}
            {data.estimate.lines.map((l) => (
              <div key={l.code} className="flex items-baseline justify-between gap-3">
                <span className="text-slate-500">
                  {l.label}
                  {l.qty > 1 && <span className="text-navy-400"> × {l.qty.toLocaleString()}</span>}
                </span>
                <span className="font-semibold text-navy-900">{mnt(l.amount)}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-2 border-t border-slate-200/60 pt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-500">Дүн (НӨАТ-гүй)</span>
              <span className="font-semibold text-navy-900">{mnt(data.estimate.subtotal)}</span>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-500">НӨАТ ({pricing.VAT_PERCENT}%)</span>
              <span className="font-semibold text-navy-900">{mnt(data.estimate.vat)}</span>
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="font-bold text-slate-900">Нийт</span>
              <span className="text-2xl font-extrabold tracking-tight text-indigo-600">{mnt(data.estimate.total)}</span>
            </div>
            <p className="pt-2 text-[12px] leading-snug text-slate-500">{data.estimate.note}</p>
          </div>
          {toggling && <div className="mt-3 flex justify-center"><Spinner /></div>}
        </div>
      </div>
    </div>
  );
}

function ServiceCard({
  no,
  title,
  desc,
  price,
  module,
  canToggle,
  busy,
  onToggle,
}: {
  no: string;
  title: string;
  desc: string;
  price: string;
  module?: TenantModuleInfo;
  canToggle: boolean;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="card flex items-center justify-between gap-4 p-5">
      <div>
        <p className="font-bold text-slate-900">
          <span className="mr-1.5 text-[12px] font-black tracking-widest text-navy-300">{no}</span>
          {title}
        </p>
        <p className="mt-0.5 text-[13.5px] text-slate-500">{desc}</p>
        <p className="mt-1 text-[12.5px] font-semibold text-indigo-600">{price}</p>
      </div>
      <Toggle enabled={Boolean(module?.enabled)} disabled={!canToggle || busy} onClick={() => onToggle(!module?.enabled)} ownerOnlyHint={!canToggle} />
    </div>
  );
}

function Toggle({
  enabled,
  disabled,
  onClick,
  ownerOnlyHint,
}: {
  enabled: boolean;
  disabled: boolean;
  onClick: () => void;
  ownerOnlyHint?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? 'bg-teal-500' : 'bg-navy-200'} ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
      title={ownerOnlyHint ? 'Зөвхөн эзэмшигч өөрчилнө' : undefined}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-navy-50 px-4 py-3">
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-slate-900">{value.toLocaleString()}</p>
    </div>
  );
}
