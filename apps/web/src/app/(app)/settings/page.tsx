'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';
import { shortDate } from '@/lib/format';
import type { IntegrationKind, IntegrationRequest, TenantInfo } from '@/lib/types';

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

const REQUEST_STATUS_MN: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'Илгээгдээгүй (имэйл алдаа)', cls: 'bg-amber-50 text-amber-700' },
  EMAIL_SENT: { label: 'Хүсэлт илгээгдсэн — хүлээгдэж буй', cls: 'bg-navy-50 text-navy-700' },
  APPROVED: { label: 'Баталгаажсан', cls: 'bg-teal-50 text-teal-700' },
  REJECTED: { label: 'Татгалзсан', cls: 'bg-red-50 text-red-600' },
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
  bonumTerminalId: string;
}

export default function SettingsPage() {
  const [info, setInfo] = useState<TenantInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<OrgForm | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<IntegrationRequest[]>([]);
  const [requestBusy, setRequestBusy] = useState<IntegrationKind | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [bonumSecret, setBonumSecret] = useState('');
  const [bonumChecksum, setBonumChecksum] = useState('');
  const isOwner = getSessionUser()?.role === 'OWNER';

  const loadRequests = useCallback(() => {
    api<{ items: IntegrationRequest[] }>('/integrations/requests')
      .then((r) => setRequests(r.items))
      .catch(() => undefined);
  }, []);

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
          bonumTerminalId: r.tenant.bonumTerminalId ?? '',
        });
      })
      .catch((e) => setError(e.message));
    loadRequests();
  }, [loadRequests]);

  async function submitRequest(kind: IntegrationKind) {
    setRequestBusy(kind);
    setRequestError(null);
    try {
      await api('/integrations/requests', { method: 'POST', body: JSON.stringify({ kind }) });
      loadRequests();
    } catch (e) {
      setRequestError(e instanceof ApiError ? e.message : 'Хүсэлт илгээж чадсангүй');
    } finally {
      setRequestBusy(null);
    }
  }

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
          bonumTerminalId: form.bonumTerminalId.trim(),
          // Нууцууд write-only: хоосон үлдээвэл өмнөх утга хадгалагдана.
          ...(bonumSecret.trim() ? { bonumAppSecret: bonumSecret.trim() } : {}),
          ...(bonumChecksum.trim() ? { bonumChecksumKey: bonumChecksum.trim() } : {}),
        }),
      });
      setBonumSecret('');
      setBonumChecksum('');
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

      {/* Bonum терминалын credentials — гэрээ баталгаажсаны дараа имэйлээр ирнэ */}
      <div className="card space-y-5 p-6">
        <div>
          <h2 className="font-bold text-navy-900">Bonum холболт (Terminal)</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Bonum-ийн гэрээ баталгаажсаны дараа имэйлээр ирсэн Terminal ID, Secret Key, Checksum Key-г энд оруулна.
            Нууц түлхүүрүүд шифрлэгдэж хадгалагдах бөгөөд дахин харагдахгүй.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          {field('Terminal ID', 'bonumTerminalId', { maxLength: 30 })}
          <div>
            <label className="label">Secret Key {info.tenant.hasBonumAppSecret && <span className="text-teal-600">✓ тохируулсан</span>}</label>
            <input
              className="input"
              type="password"
              value={bonumSecret}
              onChange={(e) => setBonumSecret(e.target.value)}
              disabled={!isOwner}
              placeholder={info.tenant.hasBonumAppSecret ? '•••••• (солих бол шинээр оруулна)' : ''}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label">Checksum Key {info.tenant.hasBonumChecksumKey && <span className="text-teal-600">✓ тохируулсан</span>}</label>
            <input
              className="input"
              type="password"
              value={bonumChecksum}
              onChange={(e) => setBonumChecksum(e.target.value)}
              disabled={!isOwner}
              placeholder={info.tenant.hasBonumChecksumKey ? '•••••• (солих бол шинээр оруулна)' : ''}
              autoComplete="new-password"
            />
          </div>
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

      {/* Бүртгүүлэх хүсэлтүүд — Bonum/LIME талд автомат бүртгэл байхгүй тул
          хүсэлтийг бид имэйлээр илгээж, хариу ирмэгц админ баталгаажуулна */}
      <div className="card space-y-4 p-6">
        <div>
          <h2 className="font-bold text-navy-900">Интеграцийн бүртгэлийн хүсэлт</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Дээрх мэдээллээ <b>үнэн зөв, гүйцэд</b> хадгалсны дараа хүсэлтээ илгээнэ. Бид таны мэдээллийг
            Bonum / eBarimt (LIME) талд имэйлээр дамжуулж, бүртгэл хийгдмэгц энд төлөв нь шинэчлэгдэнэ.
          </p>
        </div>
        {(['BONUM', 'EBARIMT'] as IntegrationKind[]).map((kind) => {
          const latest = requests.find((r) => r.kind === kind);
          const st = latest ? REQUEST_STATUS_MN[latest.status] : null;
          const canSubmit = isOwner && (!latest || latest.status === 'REJECTED');
          return (
            <div key={kind} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <div>
                <p className="font-semibold text-navy-900">{kind === 'BONUM' ? 'Bonum Gateway — төлбөр хүлээн авах' : 'eBarimt (ТЕГ POS API, LIME)'}</p>
                {latest ? (
                  <p className="mt-1 text-[12.5px] text-muted">
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${st!.cls}`}>{st!.label}</span>
                    <span className="ml-2">{shortDate(latest.createdAt)}</span>
                    {latest.note && <span className="ml-2">— {latest.note}</span>}
                  </p>
                ) : (
                  <p className="mt-1 text-[12.5px] text-muted">Хүсэлт илгээгээгүй байна</p>
                )}
              </div>
              {canSubmit && (
                <button className="btn-secondary" onClick={() => submitRequest(kind)} disabled={requestBusy !== null}>
                  {requestBusy === kind ? <Spinner className="h-4 w-4" /> : latest ? 'Дахин илгээх' : 'Хүсэлт илгээх'}
                </button>
              )}
            </div>
          );
        })}
        {requestError && <ErrorNote message={requestError} />}
      </div>

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
