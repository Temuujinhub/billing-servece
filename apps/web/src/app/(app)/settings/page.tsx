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

const DEFAULT_TEMPLATE = '{{байгууллага}}: Танд {{дүн}} нэхэмжлэх ирлээ{{хугацаа}}. Төлөх: {{линк}}';

const TEMPLATE_VARS = [
  { token: '{{байгууллага}}', hint: 'Байгууллагын нэр' },
  { token: '{{нэр}}', hint: 'Төлөгчийн нэр' },
  { token: '{{дугаар}}', hint: 'Нэхэмжлэхийн дугаар' },
  { token: '{{дүн}}', hint: 'Мөнгөн дүн' },
  { token: '{{хугацаа}}', hint: 'Төлөх хугацаа (байвал)' },
  { token: '{{линк}}', hint: 'Төлбөрийн линк (заавал)' },
];

/** Mirror of the server-side renderer with sample data for live preview. */
function templatePreview(template: string): string {
  const tpl = template.trim() || DEFAULT_TEMPLATE;
  let out = tpl
    .replaceAll('{{байгууллага}}', 'Ирээдүй Сургууль')
    .replaceAll('{{нэр}}', 'Бат Болд')
    .replaceAll('{{дугаар}}', 'INV-00042')
    .replaceAll('{{дүн}}', '150,000₮')
    .replaceAll('{{хугацаа}}', ', хугацаа: 2026-09-01')
    .replaceAll('{{линк}}', 'https://billing.mastrsys.com/pay/aB3xK9…');
  if (!out.includes('https://billing.mastrsys.com/pay/')) out += ' https://billing.mastrsys.com/pay/aB3xK9…';
  return out;
}

/** Cyrillic → UCS-2: 70 chars per segment (67 multipart). */
function segmentEstimate(text: string): number {
  if (text.length <= 70) return 1;
  return Math.ceil(text.length / 67);
}

const KYB_MN: Record<string, string> = {
  DRAFT: 'Ноорог',
  SUBMITTED: 'Илгээсэн',
  UNDER_REVIEW: 'Хянагдаж буй',
  APPROVED: 'Баталгаажсан',
  REJECTED: 'Татгалзсан',
  NEEDS_INFO: 'Мэдээлэл дутуу',
};

export default function SettingsPage() {
  const [info, setInfo] = useState<TenantInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [smsTemplate, setSmsTemplate] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOwner = getSessionUser()?.role === 'OWNER';

  useEffect(() => {
    api<TenantInfo>('/tenant')
      .then((r) => {
        setInfo(r);
        setName(r.tenant.name);
        setPrefix(r.tenant.invoicePrefix);
        setSmsTemplate(r.tenant.smsTemplate ?? '');
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api('/tenant', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), invoicePrefix: prefix.trim().toUpperCase(), smsTemplate }),
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  if (error && !info) return <ErrorNote message={error} />;
  if (!info) return <PageLoader />;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Тохиргоо</h1>
        <p className="mt-1 text-sm text-slate-500">
          KYB төлөв: <b className="text-navy-800">{KYB_MN[info.tenant.kybStatus] ?? info.tenant.kybStatus}</b>
          {info.tenant.regNo && <> · Регистр: {info.tenant.regNo}</>}
        </p>
      </div>

      <div className="card space-y-5 p-6">
        <h2 className="font-bold text-slate-900">Байгууллага</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label">Нэр</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} />
          </div>
          <div>
            <label className="label">Нэхэмжлэхийн prefix</label>
            <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} disabled={!isOwner} maxLength={8} />
            <p className="mt-1 text-[12px] text-slate-500">Жишээ: {prefix || 'INV'}-00042</p>
          </div>
        </div>
        {error && <ErrorNote message={error} />}
        {saved && <p className="text-sm font-semibold text-indigo-600">✓ Хадгалагдлаа</p>}
        {isOwner && (
          <div className="flex justify-end">
            <button className="btn-primary min-w-[130px]" onClick={save} disabled={busy}>
              {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Хадгалах'}
            </button>
          </div>
        )}
      </div>

      {/* SMS template builder */}
      <div className="card space-y-4 p-6">
        <div>
          <h2 className="font-bold text-slate-900">Мессежийн загвар</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Төлөгчид очих SMS-ийн бүтцийг өөрөө тохируулна. <b>{'{{линк}}'}</b> заавал байх ёстой.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_VARS.map((v) => (
            <button
              key={v.token}
              type="button"
              disabled={!isOwner}
              onClick={() => setSmsTemplate((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${v.token}`)}
              className="rounded-full bg-navy-50 px-3 py-1.5 text-[12.5px] font-semibold text-navy-700 hover:bg-teal-50 hover:text-indigo-700 disabled:opacity-50"
              title={v.hint}
            >
              {v.token}
            </button>
          ))}
        </div>
        <textarea
          className="input min-h-[90px] font-mono text-[13px]"
          value={smsTemplate}
          onChange={(e) => setSmsTemplate(e.target.value)}
          disabled={!isOwner}
          maxLength={320}
          placeholder={DEFAULT_TEMPLATE}
        />
        <div className="rounded-xl bg-navy-900 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-navy-300">Урьдчилсан харагдац</p>
          <p className="mt-2 rounded-lg bg-white/10 px-3.5 py-3 text-[13.5px] leading-relaxed text-white">{templatePreview(smsTemplate)}</p>
          <p className="mt-2 text-right text-[12px] text-navy-300">
            {templatePreview(smsTemplate).length} тэмдэгт ≈ <b className="text-teal-300">{segmentEstimate(templatePreview(smsTemplate))} segment</b> ({segmentEstimate(templatePreview(smsTemplate)) * 25}₮)
          </p>
        </div>
        {smsTemplate.trim() !== '' && !smsTemplate.includes('{{линк}}') && (
          <p className="rounded-lg bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">
            ⚠ Загварт {'{{линк}}'} алга — төлөгч төлбөрөө хийж чадахгүй тул хадгалагдахгүй.
          </p>
        )}
        {isOwner && (
          <div className="flex justify-between">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSmsTemplate('')}
              title="Хоосон үлдээвэл системийн үндсэн загвар ашиглагдана"
            >
              Үндсэн загвар руу буцаах
            </button>
            <button className="btn-primary min-w-[130px]" onClick={save} disabled={busy}>
              {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Хадгалах'}
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <h2 className="px-6 py-4 font-bold text-slate-900">Багийн гишүүд</h2>
        <table className="w-full border-t border-slate-200/60">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="th">Нэр</th>
              <th className="th">Имэйл</th>
              <th className="th">Эрх</th>
              <th className="th">Нэгдсэн</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60">
            {info.team.map((m) => (
              <tr key={m.id}>
                <td className="td font-medium">{m.user.name}</td>
                <td className="td text-slate-500">{m.user.email}</td>
                <td className="td">
                  <span className="rounded-full bg-navy-50 px-2.5 py-1 text-[12px] font-semibold text-navy-700">{ROLE_MN[m.role] ?? m.role}</span>
                </td>
                <td className="td text-slate-500">{shortDate(m.since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-6 py-4 text-[12.5px] text-slate-500">Гишүүн урих, эрх өөрчлөх — дараагийн хувилбарт.</p>
      </div>
    </div>
  );
}
