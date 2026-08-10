'use client';

import { useMemo, useState } from 'react';
import { mnt } from '@/lib/format';

const BASE = 20000;
const SMS = 25;
const EBARIMT = 20000;
const POS = 20000;

/** LP-04: interactive module/price calculator with the mandatory disclaimer. */
export function PricingCalculator() {
  const [invoices, setInvoices] = useState(300);
  const [smsPerInvoice, setSmsPerInvoice] = useState(2);
  const [ebarimt, setEbarimt] = useState(true);
  const [pos, setPos] = useState(0);

  const total = useMemo(() => {
    const smsSegments = invoices * smsPerInvoice;
    return BASE + smsSegments * SMS + (ebarimt ? EBARIMT : 0) + pos * POS;
  }, [invoices, smsPerInvoice, ebarimt, pos]);

  return (
    <div className="card mx-auto max-w-3xl p-6 sm:p-8">
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="space-y-6">
          <div>
            <label className="label" htmlFor="calc-inv">
              Сарын нэхэмжлэхийн тоо: <b className="text-navy-900">{invoices.toLocaleString()}</b>
            </label>
            <input
              id="calc-inv"
              type="range"
              min={50}
              max={5000}
              step={50}
              value={invoices}
              onChange={(e) => setInvoices(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
          </div>
          <div>
            <label className="label" htmlFor="calc-sms">
              Нэхэмжлэх тутмын SMS segment: <b className="text-navy-900">{smsPerInvoice}</b>
            </label>
            <input
              id="calc-sms"
              type="range"
              min={1}
              max={4}
              value={smsPerInvoice}
              onChange={(e) => setSmsPerInvoice(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <p className="mt-1 text-[12px] text-slate-500">Кирилл текст 70 тэмдэгт = 1 segment</p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-navy-800">
            <input
              type="checkbox"
              checked={ebarimt}
              onChange={(e) => setEbarimt(e.target.checked)}
              className="h-4.5 w-4.5 accent-indigo-600"
            />
            eBarimt холболт ({mnt(EBARIMT)}/сар)
          </label>
          <div>
            <label className="label" htmlFor="calc-pos">
              POS/Cloud Print төхөөрөмж: <b className="text-navy-900">{pos}</b>
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
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl bg-navy-900 p-6 text-white">
          <div className="space-y-3 text-[13.5px]">
            <Row label="Суурь хураамж" value={mnt(BASE)} />
            <Row label={`SMS ${(invoices * smsPerInvoice).toLocaleString()} segment × 25₮`} value={mnt(invoices * smsPerInvoice * SMS)} />
            {ebarimt && <Row label="eBarimt холболт" value={mnt(EBARIMT)} />}
            {pos > 0 && <Row label={`POS ${pos} × 20,000₮`} value={mnt(pos * POS)} />}
          </div>
          <div className="mt-6 border-t border-white/15 pt-4">
            <p className="text-[13px] text-navy-200">Сарын урьдчилсан төлбөр</p>
            <p className="text-3xl font-extrabold tracking-tight text-teal-300">{mnt(total)}</p>
            <p className="mt-2 text-[11.5px] leading-snug text-navy-300">
              * Урьдчилсан тооцоо. Эцсийн үнэ provider гэрээ, НӨАТ болон багцын нөхцөлөөр баталгаажина.
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
