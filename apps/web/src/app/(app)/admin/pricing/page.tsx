'use client';

import { useEffect, useState } from 'react';
import { AdminGate, AdminHeader } from '@/components/admin';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

interface Pricing { BASE_FEE: number; SMS_PER_SEGMENT: number; EBARIMT_CONNECTION: number; POS_PER_DEVICE: number }
interface Features { registrationOpen: boolean; reminderBeta: boolean }

const PRICE_FIELDS: { key: keyof Pricing; label: string; unit: string }[] = [
  { key: 'BASE_FEE', label: 'Суурь хураамж', unit: '₮/сар' },
  { key: 'SMS_PER_SEGMENT', label: 'SMS', unit: '₮/segment' },
  { key: 'EBARIMT_CONNECTION', label: 'eBarimt холболт', unit: '₮/сар' },
  { key: 'POS_PER_DEVICE', label: 'POS төхөөрөмж', unit: '₮/төхөөрөмж' },
];

const FLAGS: { key: keyof Features; label: string; desc: string }[] = [
  { key: 'registrationOpen', label: 'Шинэ бүртгэл нээлттэй', desc: 'Унтраавал self-service бүртгэл түр зогсоно (kill-switch)' },
  { key: 'reminderBeta', label: 'Сануулга (beta)', desc: 'Хугацаа хэтрэлтийн автомат сануулгын beta туршилт' },
];

export default function AdminPricingPage() {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [features, setFeatures] = useState<Features | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api<Pricing>('/admin/pricing'), api<Features>('/admin/features')])
      .then(([p, f]) => { setPricing(p); setFeatures(f); })
      .catch((e) => setError(e.message));
  }, []);

  async function savePricing() {
    if (!pricing) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      setPricing(await api<Pricing>('/admin/pricing', { method: 'PUT', body: JSON.stringify(pricing) }));
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

  return (
    <AdminGate title="Үнэ & Flags">
      <div className="max-w-3xl space-y-6">
        <AdminHeader title="🏷️ Үнэ & Feature flags" sub="Тарифын өөрчлөлт бүх байгууллагын дараагийн тооцоонд шууд нөлөөлнө (A-16/A-17)" />
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
              <p className="text-[12.5px] text-slate-500">
                ⚠ Эдгээр нь PRD-ийн эхний таамаг үнэ — provider гэрээ, НӨАТ-аар баталгаажуулж өөрчилнө. Өөрчлөлт бүр audit-д бүртгэгдэнэ.
              </p>
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
          </>
        )}
      </div>
    </AdminGate>
  );
}
