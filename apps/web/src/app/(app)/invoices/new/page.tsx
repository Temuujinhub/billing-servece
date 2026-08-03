'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ErrorNote, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { mnt } from '@/lib/format';
import type { InvoiceDetail } from '@/lib/types';

export default function NewInvoicePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    amount: '',
    description: '',
    dueDate: '',
    send: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountNum = Number(form.amount.replace(/[,\s]/g, '')) || 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<InvoiceDetail & { payUrl?: string }>('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          amount: amountNum,
          description: form.description.trim(),
          dueDate: form.dueDate || undefined,
          send: form.send,
        }),
      });
      router.replace(`/invoices/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Алдаа гарлаа. Дахин оролдоно уу.');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href="/invoices" className="text-[13.5px] font-semibold text-teal-600 hover:text-teal-700">
          ← Нэхэмжлэх рүү буцах
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-navy-900">Шинэ нэхэмжлэх</h1>
        <p className="mt-1 text-sm text-muted">Нэг төлөгчид ганц нэхэмжлэх. Олон бол Excel импорт ашиглаарай.</p>
      </div>

      <form onSubmit={onSubmit} className="card space-y-5 p-7" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cname">Төлөгчийн нэр</label>
            <input id="cname" required className="input" value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Овог Нэр / Байгууллага" />
          </div>
          <div>
            <label className="label" htmlFor="cphone">Утасны дугаар</label>
            <input id="cphone" required className="input" value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="88112233" />
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="amount">Дүн (₮)</label>
            <input id="amount" required inputMode="numeric" className="input" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="150000" />
            {amountNum > 0 && <p className="mt-1 text-[12.5px] font-medium text-teal-600">{mnt(amountNum)}</p>}
          </div>
          <div>
            <label className="label" htmlFor="due">Төлөх хугацаа <span className="text-muted">(заавал биш)</span></label>
            <input id="due" type="date" className="input" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="desc">Тайлбар</label>
          <input id="desc" required maxLength={160} className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Жишээ: 10-р сарын сургалтын төлбөр" />
          <p className="mt-1 text-right text-[12px] text-muted">{form.description.length}/160</p>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-navy-50/50 px-4 py-3.5 text-sm font-medium text-navy-800">
          <input type="checkbox" className="h-4 w-4 accent-teal-500" checked={form.send} onChange={(e) => setForm((f) => ({ ...f, send: e.target.checked }))} />
          Үүсгэмэгц SMS-ээр төлбөрийн линк илгээх
        </label>

        {/* Money confirmation summary (UX rule §12.3) */}
        {amountNum > 0 && (
          <div className="rounded-xl bg-navy-900 px-5 py-4 text-white">
            <div className="flex items-center justify-between text-sm">
              <span className="text-navy-200">1 төлөгч · {form.send ? 'SMS илгээгдэнэ (~2 segment ≈ 50₮)' : 'илгээхгүй'}</span>
              <span className="text-lg font-extrabold text-teal-300">{mnt(amountNum)}</span>
            </div>
          </div>
        )}

        {error && <ErrorNote message={error} />}
        <div className="flex justify-end gap-3">
          <Link href="/invoices" className="btn-secondary">Болих</Link>
          <button type="submit" disabled={busy} className="btn-primary min-w-[160px]">
            {busy ? <Spinner className="h-5 w-5 text-white" /> : form.send ? 'Үүсгээд илгээх' : 'Үүсгэх'}
          </button>
        </div>
      </form>
    </div>
  );
}
