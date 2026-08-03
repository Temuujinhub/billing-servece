'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';
import { mnt, shortDate } from '@/lib/format';
import type { BillingOverview } from '@/lib/types';

const MODULE_INFO: Record<string, { title: string; desc: string; price: string }> = {
  SMS: { title: 'SMS илгээлт', desc: 'Төлбөрийн линкийг SMS-ээр хүргэх', price: '25₮/segment' },
  EBARIMT: { title: 'eBarimt', desc: 'Төлбөр бүрд НӨАТ-ын баримт автоматаар', price: '20,000₮/сар' },
  POS: { title: 'POS / Cloud Print', desc: 'Салбар дээрх баримт хэвлэлт', price: '20,000₮/төхөөрөмж' },
  REMINDER: { title: 'Сануулга (удахгүй)', desc: 'Хугацаа хэтрэлтийн автомат сануулга', price: 'Тун удахгүй' },
};

export default function BillingPage() {
  const [data, setData] = useState<BillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const isOwner = getSessionUser()?.role === 'OWNER';

  const load = useCallback(() => {
    api<BillingOverview>('/billing').then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(code: string, enabled: boolean) {
    setToggling(code);
    setError(null);
    try {
      await api(`/billing/modules/${code}`, { method: 'POST', body: JSON.stringify({ enabled }) });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setToggling(null);
    }
  }

  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Billing & Modules</h1>
        <p className="mt-1 text-sm text-muted">Мөчлөг: {shortDate(data.cycleStart)}-оос хойш · Модулиа сонгож зардлаа удирдана</p>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Modules */}
        <div className="space-y-4 lg:col-span-2">
          {data.modules
            .filter((m) => MODULE_INFO[m.code])
            .map((m) => {
              const info = MODULE_INFO[m.code];
              const disabled = m.code === 'REMINDER' || !isOwner;
              return (
                <div key={m.code} className="card flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="font-bold text-navy-900">{info.title}</p>
                    <p className="mt-0.5 text-[13.5px] text-muted">{info.desc}</p>
                    <p className="mt-1 text-[12.5px] font-semibold text-teal-600">{info.price}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={m.enabled}
                    disabled={disabled || toggling === m.code}
                    onClick={() => toggle(m.code, !m.enabled)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                      m.enabled ? 'bg-teal-500' : 'bg-navy-200'
                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                    title={!isOwner ? 'Зөвхөн эзэмшигч өөрчилнө' : undefined}
                  >
                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${m.enabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
              );
            })}

          {/* Usage meters */}
          <div className="card p-5">
            <h2 className="font-bold text-navy-900">Энэ мөчлөгийн хэрэглээ</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Meter label="SMS segment" value={data.usage.smsSegments} />
              <Meter label="Нэхэмжлэх" value={data.usage.invoicesCreated} />
              <Meter label="Төлөлт" value={data.usage.paymentsSucceeded} />
              <Meter label="eBarimt" value={data.usage.receiptsCreated} />
            </div>
          </div>
        </div>

        {/* Estimate */}
        <div className="card h-fit p-6">
          <h2 className="font-bold text-navy-900">Сарын урьдчилсан нэхэмжлэх</h2>
          <div className="mt-4 space-y-3 text-sm">
            {data.estimate.lines.map((l) => (
              <div key={l.code} className="flex items-baseline justify-between gap-3">
                <span className="text-muted">
                  {l.label}
                  {l.qty > 1 && <span className="text-navy-400"> × {l.qty.toLocaleString()}</span>}
                </span>
                <span className="font-semibold text-navy-900">{mnt(l.amount)}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-baseline justify-between">
              <span className="font-bold text-navy-900">Нийт</span>
              <span className="text-2xl font-extrabold tracking-tight text-teal-600">{mnt(data.estimate.total)}</span>
            </div>
            <p className="mt-3 text-[12px] leading-snug text-muted">{data.estimate.note}</p>
          </div>
          {toggling && <div className="mt-3 flex justify-center"><Spinner /></div>}
        </div>
      </div>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-navy-50 px-4 py-3">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-navy-900">{value.toLocaleString()}</p>
    </div>
  );
}
