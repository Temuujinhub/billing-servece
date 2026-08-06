'use client';

import { useEffect, useState } from 'react';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';
import { shortDate } from '@/lib/format';
import type { TenantInfo } from '@/lib/types';

const ROLE_MN: Record<string, string> = {
  OWNER: 'Эзэмшигч',
  OPERATOR: 'Оператор',
  ACCOUNTANT: 'Нягтлан',
  VIEWER: 'Үзэгч',
};

const KYB_MN: Record<string, string> = {
  DRAFT: 'Ноорог',
  SUBMITTED: 'Илгээсэн',
  UNDER_REVIEW: 'Хянагдаж буй',
  APPROVED: 'Баталгаажсан',
  REJECTED: 'Татгалзсан',
  NEEDS_INFO: 'Мэдээлэл дутуу',
};

/** Bonum анкет + eBarimt бүртгэлд шаардлагатай байгууллагын талбарууд. */
interface OrgForm {
  name: string;
  invoicePrefix: string;
  regNo: string;
  address: string;
  contactPhone: string;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  ebarimtMerchantTin: string;
  ebarimtPosNo: string;
  ebarimtBranchNo: string;
  ebarimtDistrictCode: string;
}

export default function SettingsPage() {
  const [info, setInfo] = useState<TenantInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<OrgForm | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOwner = getSessionUser()?.role === 'OWNER';

  useEffect(() => {
    api<TenantInfo>('/tenant')
      .then((r) => {
        setInfo(r);
        setForm({
          name: r.tenant.name,
          invoicePrefix: r.tenant.invoicePrefix,
          regNo: r.tenant.regNo ?? '',
          address: r.tenant.address ?? '',
          contactPhone: r.tenant.contactPhone ?? '',
          bankName: r.tenant.bankName ?? '',
          bankAccountNo: r.tenant.bankAccountNo ?? '',
          bankAccountName: r.tenant.bankAccountName ?? '',
          ebarimtMerchantTin: r.tenant.ebarimtMerchantTin ?? '',
          ebarimtPosNo: r.tenant.ebarimtPosNo ?? '',
          ebarimtBranchNo: r.tenant.ebarimtBranchNo ?? '',
          ebarimtDistrictCode: r.tenant.ebarimtDistrictCode ?? '',
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  function set<K extends keyof OrgForm>(key: K, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api('/tenant', {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          invoicePrefix: form.invoicePrefix.trim().toUpperCase(),
          regNo: form.regNo.trim(),
          address: form.address.trim(),
          contactPhone: form.contactPhone.trim(),
          bankName: form.bankName.trim(),
          bankAccountNo: form.bankAccountNo.trim(),
          bankAccountName: form.bankAccountName.trim(),
          ebarimtMerchantTin: form.ebarimtMerchantTin.trim(),
          ebarimtPosNo: form.ebarimtPosNo.trim(),
          ebarimtBranchNo: form.ebarimtBranchNo.trim(),
          ebarimtDistrictCode: form.ebarimtDistrictCode.trim(),
        }),
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  if (error && !info) return <ErrorNote message={error} />;
  if (!info || !form) return <PageLoader />;

  const field = (label: string, key: keyof OrgForm, props?: { placeholder?: string; maxLength?: number; hint?: string }) => (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        disabled={!isOwner}
        placeholder={props?.placeholder}
        maxLength={props?.maxLength}
      />
      {props?.hint && <p className="mt-1 text-[12px] text-muted">{props.hint}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Тохиргоо</h1>
        <p className="mt-1 text-sm text-muted">
          KYB төлөв: <b className="text-navy-800">{KYB_MN[info.tenant.kybStatus] ?? info.tenant.kybStatus}</b>
          {info.tenant.regNo && <> · Регистр: {info.tenant.regNo}</>}
        </p>
      </div>

      <div className="card space-y-5 p-6">
        <h2 className="font-bold text-navy-900">Байгууллага</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {field('Нэр', 'name')}
          <div>
            <label className="label">Нэхэмжлэхийн prefix</label>
            <input className="input" value={form.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value)} disabled={!isOwner} maxLength={8} />
            <p className="mt-1 text-[12px] text-muted">Жишээ: {form.invoicePrefix || 'INV'}-00042</p>
          </div>
          {field('Регистрийн дугаар', 'regNo', { maxLength: 20 })}
          {field('Утас', 'contactPhone', { maxLength: 30 })}
        </div>
        {field('Хаяг', 'address', { maxLength: 300, hint: 'Байгууллагын албан ёсны хаяг' })}
      </div>

      {/* Bonum Gateway анкетэд шаардагдах заавал бөглөх мэдээлэл */}
      <div className="card space-y-5 p-6">
        <div>
          <h2 className="font-bold text-navy-900">Төлбөр хүлээн авах данс</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Bonum Gateway-д мерчант бүртгүүлэхэд (анкет) байгууллагын хаяг, утас, регистр, дансны мэдээлэл заавал шаардлагатай.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {field('Банк', 'bankName', { placeholder: 'Хаан банк' })}
          {field('Дансны дугаар', 'bankAccountNo', { maxLength: 30 })}
          {field('Дансны нэр', 'bankAccountName', { hint: 'Байгууллагын нэр дээрх данс' })}
        </div>
      </div>

      {/* eBarimt POS API 3.0 — компани ӨӨРИЙН ТЕГ бүртгэлээ ашиглана */}
      <div className="card space-y-5 p-6">
        <div>
          <h2 className="font-bold text-navy-900">eBarimt бүртгэл (ТЕГ POS API)</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Компани ТЕГ-т өөрийн POS-оор бүртгүүлсэн байх ёстой — өөрийн merchantTin болон тухайн POS-д олгогдсон posNo.
            Өөр байгууллагын posNo-г ашиглаж болохгүй.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {field('Merchant TIN', 'ebarimtMerchantTin', { maxLength: 20, hint: 'ТЕГ-ийн татвар төлөгчийн дугаар (TIN)' })}
          {field('POS дугаар (posNo)', 'ebarimtPosNo', { maxLength: 20 })}
          {field('Салбарын дугаар (branchNo)', 'ebarimtBranchNo', { maxLength: 10, placeholder: '001' })}
          {field('Дүүргийн код (districtCode)', 'ebarimtDistrictCode', { maxLength: 10, placeholder: '3505' })}
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {saved && <p className="text-sm font-semibold text-teal-600">✓ Хадгалагдлаа</p>}
      {isOwner && (
        <div className="flex justify-end">
          <button className="btn-primary min-w-[130px]" onClick={save} disabled={busy}>
            {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Хадгалах'}
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <h2 className="px-6 py-4 font-bold text-navy-900">Багийн гишүүд</h2>
        <table className="w-full border-t border-line">
          <thead className="bg-navy-50/60">
            <tr>
              <th className="th">Нэр</th>
              <th className="th">Имэйл</th>
              <th className="th">Эрх</th>
              <th className="th">Нэгдсэн</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {info.team.map((m) => (
              <tr key={m.id}>
                <td className="td font-medium">{m.user.name}</td>
                <td className="td text-muted">{m.user.email}</td>
                <td className="td">
                  <span className="rounded-full bg-navy-50 px-2.5 py-1 text-[12px] font-semibold text-navy-700">{ROLE_MN[m.role] ?? m.role}</span>
                </td>
                <td className="td text-muted">{shortDate(m.since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-6 py-4 text-[12.5px] text-muted">Гишүүн урих, эрх өөрчлөх — дараагийн хувилбарт.</p>
      </div>
    </div>
  );
}
