'use client';

import { useEffect, useState } from 'react';
import { AdminGate, AdminHeader } from '@/components/admin';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { mnt, shortDate } from '@/lib/format';
import type { EbarimtTier, ServiceBill } from '@/lib/types';

interface AdminPricing {
  INVOICE_MSG: number;
  API_INVOICE_MSG: number;
  EBARIMT_API_ONBOARDING: number;
  EBARIMT_API_TIERS: EbarimtTier[];
  POS_PER_DEVICE: number;
  VAT_PERCENT: number;
  BILLER_TENANT_ID: string | null;
}
interface Features { registrationOpen: boolean; reminderBeta: boolean }
interface CloseResult { cycle: string; created: number; invoiced: number; billerConfigured: boolean }

type NumericKey = 'INVOICE_MSG' | 'API_INVOICE_MSG' | 'EBARIMT_API_ONBOARDING' | 'POS_PER_DEVICE' | 'VAT_PERCENT';

const PRICE_FIELDS: { key: NumericKey; label: string; unit: string }[] = [
  { key: 'INVOICE_MSG', label: 'Excel файл ашиглан лист үүсгэж нэхэмжлэл илгээх (Үйлчилгээ 1)', unit: '₮/илгээлт' },
  { key: 'API_INVOICE_MSG', label: 'API ашиглан нэхэмжлэл илгээх үйлчилгээ (Үйлчилгээ 2, default — байгууллага бүр гэрээт үнэтэй байж болно)', unit: '₮/илгээлт' },
  { key: 'EBARIMT_API_ONBOARDING', label: 'eBarimt API интеграци — нэг удаа (Үйлчилгээ 3)', unit: '₮' },
  { key: 'POS_PER_DEVICE', label: 'POS терминал (Үйлчилгээ 4)', unit: '₮/сар·терминал' },
  { key: 'VAT_PERCENT', label: 'НӨАТ', unit: '%' },
];

const FLAGS: { key: keyof Features; label: string; desc: string }[] = [
  { key: 'registrationOpen', label: 'Шинэ бүртгэл нээлттэй', desc: 'Унтраавал self-service бүртгэл түр зогсоно (kill-switch)' },
  { key: 'reminderBeta', label: 'Сануулга (beta)', desc: 'Хугацаа хэтрэлтийн автомат сануулгын beta туршилт' },
];

/** Өмнөх сар "YYYY-MM" — сар хаах default мөчлөг. */
function previousCycle(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function AdminPricingPage() {
  const [pricing, setPricing] = useState<AdminPricing | null>(null);
  const [features, setFeatures] = useState<Features | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const [cycle, setCycle] = useState(previousCycle());
  const [closing, setClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<CloseResult | null>(null);
  const [bills, setBills] = useState<ServiceBill[] | null>(null);

  useEffect(() => {
    Promise.all([api<AdminPricing>('/admin/pricing'), api<Features>('/admin/features')])
      .then(([p, f]) => { setPricing(p); setFeatures(f); })
      .catch((e) => setError(e.message));
    api<ServiceBill[]>('/admin/billing/bills').then(setBills).catch(() => setBills([]));
  }, []);

  async function savePricing() {
    if (!pricing) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      setPricing(await api<AdminPricing>('/admin/pricing', { method: 'PUT', body: JSON.stringify(pricing) }));
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Хадгалж чадсангүй');
    } finally { setBusy(false); }
  }

  async function toggleFlag(key: keyof Features) {
    if (!features) return;
    const next = { ...features, [key]: !features[key] };
    setFeatures(next);
    try {
      setFeatures(await api<Features>('/admin/features', { method: 'PUT', body: JSON.stringify(next) }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Flag хадгалагдсангүй');
    }
  }

  async function closeMonth() {
    setClosing(true); setError(null); setCloseResult(null);
    try {
      const res = await api<CloseResult>('/admin/billing/close-month', {
        method: 'POST',
        body: JSON.stringify(cycle.trim() ? { cycle: cycle.trim() } : {}),
      });
      setCloseResult(res);
      setBills(await api<ServiceBill[]>(`/admin/billing/bills?cycle=${encodeURIComponent(res.cycle)}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Сар хаахад алдаа гарлаа');
    } finally { setClosing(false); }
  }

  function setTier(i: number, patch: Partial<EbarimtTier>) {
    setPricing((p) => {
      if (!p) return p;
      const tiers = p.EBARIMT_API_TIERS.map((t, ti) => (ti === i ? { ...t, ...patch } : t));
      return { ...p, EBARIMT_API_TIERS: tiers };
    });
  }

  return (
    <AdminGate title="Үнэ & Flags">
      <div className="max-w-3xl space-y-6">
        <AdminHeader title="🏷️ Үнэ & Feature flags" sub="Тарифын загвар v2 — суурь хураамжгүй, 4 үйлчилгээ, бүх хураамжид НӨАТ нэмнэ. Өөрчлөлт дараагийн тооцоонд шууд нөлөөлнө." />
        {error && <ErrorNote message={error} />}
        {!pricing || !features ? (
          <PageLoader />
        ) : (
          <>
            <div className="card space-y-4 p-6">
              <h2 className="font-bold text-slate-900">Тариф</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {PRICE_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="label">{f.label} <span className="text-slate-400">({f.unit})</span></label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={pricing[f.key]}
                      onChange={(e) => setPricing((p) => p && { ...p, [f.key]: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                    />
                  </div>
                ))}
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-800">eBarimt API шатлалууд (Үйлчилгээ 3)</h3>
                <p className="text-[12.5px] text-slate-500">3 шатлал — хязгаар өсөх дарааллаар, зөвхөн сүүлийнх нь хязгааргүй (хоосон) байж болно.</p>
                <div className="mt-3 space-y-2">
                  {pricing.EBARIMT_API_TIERS.map((t, i) => (
                    <div key={i} className="grid grid-cols-[auto_1fr_1fr] items-end gap-3 rounded-xl bg-navy-50/60 px-3 py-2.5">
                      <span className="pb-2.5 text-[12.5px] font-bold text-navy-600">Шатлал {i + 1}</span>
                      <div>
                        <label className="label">Хязгаар (сарын баримт)</label>
                        <input
                          className="input"
                          inputMode="numeric"
                          value={t.upTo ?? ''}
                          placeholder={i === pricing.EBARIMT_API_TIERS.length - 1 ? 'хязгааргүй' : ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '');
                            setTier(i, { upTo: raw === '' ? null : Number(raw) });
                          }}
                        />
                      </div>
                      <div>
                        <label className="label">Сарын хураамж (₮)</label>
                        <input
                          className="input"
                          inputMode="numeric"
                          value={t.fee}
                          onChange={(e) => setTier(i, { fee: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Платформын нэхэмжлэгч байгууллага (tenant ID)</label>
                <input
                  className="input font-mono text-[13px]"
                  value={pricing.BILLER_TENANT_ID ?? ''}
                  placeholder="tenant ID…"
                  onChange={(e) => setPricing((p) => p && { ...p, BILLER_TENANT_ID: e.target.value.trim() || null })}
                />
                <p className="mt-1 text-[12.5px] text-slate-500">
                  Медиа Профессионал ХХК-ийн tenant ID — сарын нэхэмжлэх энэ байгууллагаас илгээгдэнэ
                </p>
              </div>

              {saved && <p className="text-sm font-bold text-emerald-600">✓ Хадгалагдлаа — Billing тооцоонд шууд нөлөөлнө</p>}
              <div className="flex justify-end">
                <button className="btn-primary min-w-[130px]" onClick={savePricing} disabled={busy}>
                  {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Хадгалах'}
                </button>
              </div>
            </div>

            <div className="card space-y-3 p-6">
              <h2 className="font-bold text-slate-900">Feature flags</h2>
              {FLAGS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-4 rounded-2xl border border-white/80 bg-white/50 px-4 py-3.5">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{f.label}</p>
                    <p className="text-[12.5px] text-slate-500">{f.desc}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={features[f.key]}
                    onClick={() => toggleFlag(f.key)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${features[f.key] ? 'bg-indigo-600' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${features[f.key] ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>

            {/* Сар хаах (month-close) */}
            <div className="card space-y-4 p-6">
              <div>
                <h2 className="font-bold text-slate-900">Сар хаах</h2>
                <p className="text-[12.5px] text-slate-500">
                  Мөчлөгийн тооцоог байгууллага бүрд үүсгэж, НӨАТ-тэй нэхэмжлэхийг платформын нэхэмжлэгчээс SMS-ээр илгээнэ. Идемпотент — давхар дарахад давхар тооцоо үүсэхгүй.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label">Мөчлөг (YYYY-MM)</label>
                  <input className="input w-40 font-mono" value={cycle} onChange={(e) => setCycle(e.target.value)} placeholder={previousCycle()} />
                </div>
                <button className="btn-primary min-w-[130px]" onClick={closeMonth} disabled={closing || !/^\d{4}-\d{2}$/.test(cycle.trim())}>
                  {closing ? <Spinner className="h-4 w-4 text-white" /> : 'Сар хаах'}
                </button>
              </div>
              {closeResult && (
                <div className="space-y-1.5 rounded-xl bg-navy-50 px-4 py-3 text-[13.5px] text-navy-800">
                  <p>
                    <b>{closeResult.cycle}</b> мөчлөг: тооцоо <b>{closeResult.created}</b> үүсэж, нэхэмжлэх <b>{closeResult.invoiced}</b> илгээгдлээ.
                  </p>
                  {!closeResult.billerConfigured && (
                    <p className="font-semibold text-amber-700">
                      ⚠ Платформын нэхэмжлэгч tenant тохируулаагүй тул нэхэмжлэх илгээгдээгүй — дээрх BILLER_TENANT_ID талбарыг бөглөнө үү.
                    </p>
                  )}
                </div>
              )}
              {bills === null ? (
                <PageLoader />
              ) : bills.length === 0 ? (
                <p className="text-[13px] text-slate-500">Тооцооны бичилт алга.</p>
              ) : (
                <div className="scroll-thin max-h-[360px] overflow-auto rounded-xl border border-slate-200/60">
                  <table className="w-full min-w-[560px]">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="th">Мөчлөг</th>
                        <th className="th">Байгууллага</th>
                        <th className="th text-right">Нийт (НӨАТ-тэй)</th>
                        <th className="th">Төлөв</th>
                        <th className="th">Үүссэн</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60">
                      {bills.map((b) => (
                        <tr key={b.id}>
                          <td className="td font-mono text-[12.5px]">{b.cycle}</td>
                          <td className="td font-mono text-[12px] text-slate-500">{b.tenantId}</td>
                          <td className="td text-right font-semibold">{mnt(b.total)}</td>
                          <td className="td">
                            {b.status === 'INVOICED' ? (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700">Нэхэмжилсэн</span>
                            ) : (
                              <span className="rounded-full bg-navy-50 px-2.5 py-1 text-[12px] font-semibold text-navy-600">Үүссэн</span>
                            )}
                          </td>
                          <td className="td text-slate-500">{shortDate(b.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminGate>
  );
}
