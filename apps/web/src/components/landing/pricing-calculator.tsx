'use client';

import { useEffect, useMemo, useState } from 'react';
import { mnt } from '@/lib/format';
import type { PublicPricing } from '@/lib/types';

/** Fetch бүтэлгүйтвэл ашиглах default тариф (v2). */
const DEFAULT_PRICING: PublicPricing = {
  INVOICE_MSG: 100,
  API_INVOICE_MSG: 100,
  EBARIMT_API_ONBOARDING: 100000,
  EBARIMT_API_TIERS: [
    { upTo: 500, fee: 20000 },
    { upTo: 2000, fee: 50000 },
    { upTo: null, fee: 100000 },
  ],
  POS_PER_DEVICE: 20000,
  VAT_PERCENT: 10,
};

/** LP-04: тарифын загвар v2 калькулятор — суурь хураамжгүй, НӨАТ нэмж тооцно. */
export function PricingCalculator() {
  const [pricing, setPricing] = useState<PublicPricing>(DEFAULT_PRICING);
  const [msgs, setMsgs] = useState(300);
  const [ebarimtApi, setEbarimtApi] = useState(false);
  const [tier, setTier] = useState(1);
  const [pos, setPos] = useState(0);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1/public/pricing`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (p && typeof p.INVOICE_MSG === 'number' && Array.isArray(p.EBARIMT_API_TIERS) && p.EBARIMT_API_TIERS.length === 3) {
          setPricing(p as PublicPricing);
        }
      })
      .catch(() => undefined);
  }, []);

  const tierInfo = pricing.EBARIMT_API_TIERS[tier - 1] ?? pricing.EBARIMT_API_TIERS[0];
  const { msgCost, ebarimtFee, posCost, subtotal, vat, total } = useMemo(() => {
    const msgCost = msgs * pricing.INVOICE_MSG;
    const ebarimtFee = ebarimtApi ? tierInfo.fee : 0;
    const posCost = pos * pricing.POS_PER_DEVICE;
    const subtotal = msgCost + ebarimtFee + posCost;
    const vat = Math.round((subtotal * pricing.VAT_PERCENT) / 100);
    return { msgCost, ebarimtFee, posCost, subtotal, vat, total: subtotal + vat };
  }, [msgs, ebarimtApi, tierInfo, pos, pricing]);

  return (
    <div className="card mx-auto max-w-3xl p-6 sm:p-8">
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="space-y-6">
          <div>
            <label className="label" htmlFor="calc-msgs">
              Сарын нэхэмжлэх илгээлт: <b className="text-navy-900">{msgs.toLocaleString()}</b>
            </label>
            <input
              id="calc-msgs"
              type="range"
              min={50}
              max={5000}
              step={50}
              value={msgs}
              onChange={(e) => setMsgs(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <p className="mt-1 text-[12px] text-slate-500">Нэг илгээлт {mnt(pricing.INVOICE_MSG)} — SMS ба eBarimt багтсан</p>
          </div>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-navy-800">
              <input
                type="checkbox"
                checked={ebarimtApi}
                onChange={(e) => setEbarimtApi(e.target.checked)}
                className="h-4.5 w-4.5 accent-indigo-600"
              />
              eBarimt API (өөрийн системд)
            </label>
            {ebarimtApi && (
              <select
                className="input"
                value={tier}
                onChange={(e) => setTier(Number(e.target.value))}
                aria-label="eBarimt API шатлал сонгох"
              >
                {pricing.EBARIMT_API_TIERS.map((t, i) => (
                  <option key={i} value={i + 1}>
                    Шатлал {i + 1} — сард {t.upTo ? `≤${t.upTo.toLocaleString()}` : 'хязгааргүй'} баримт · {mnt(t.fee)}/сар
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="label" htmlFor="calc-pos">
              POS терминал: <b className="text-navy-900">{pos}</b>
            </label>
            <input
              id="calc-pos"
              type="range"
              min={0}
              max={10}
              value={pos}
              onChange={(e) => setPos(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <p className="mt-1 text-[12px] text-slate-500">{mnt(pricing.POS_PER_DEVICE)}/сар · терминал бүрд, баримт хязгааргүй</p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl bg-navy-900 p-6 text-white">
          <div className="space-y-3 text-[13.5px]">
            <Row label={`Илгээлт ${msgs.toLocaleString()} × ${mnt(pricing.INVOICE_MSG)}`} value={mnt(msgCost)} />
            {ebarimtApi && (
              <Row
                label={`eBarimt API — шатлал ${tier} (${tierInfo.upTo ? `≤${tierInfo.upTo.toLocaleString()}` : 'хязгааргүй'})`}
                value={mnt(ebarimtFee)}
              />
            )}
            {pos > 0 && <Row label={`POS ${pos} × ${mnt(pricing.POS_PER_DEVICE)}`} value={mnt(posCost)} />}
            <div className="border-t border-white/15 pt-3">
              <Row label="Дүн (НӨАТ-гүй)" value={mnt(subtotal)} />
            </div>
            <Row label={`+НӨАТ ${pricing.VAT_PERCENT}%`} value={mnt(vat)} />
          </div>
          <div className="mt-6 border-t border-white/15 pt-4">
            <p className="text-[13px] text-navy-200">Сарын урьдчилсан төлбөр</p>
            <p className="text-3xl font-extrabold tracking-tight text-teal-300">{mnt(total)}</p>
            <p className="mt-2 text-[11.5px] leading-snug text-navy-300">
              Илгээлт бүрд eBarimt багтсан. Нэг удаагийн API интеграцийн хураамж {mnt(pricing.EBARIMT_API_ONBOARDING)}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-navy-200">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
