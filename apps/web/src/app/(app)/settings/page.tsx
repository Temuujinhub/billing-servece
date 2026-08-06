'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, Modal, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';
import { shortDate } from '@/lib/format';
import type { IntegrationKind, IntegrationRequest, Role, TenantInfo } from '@/lib/types';

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
    .replaceAll('{{линк}}', 'https://billing.mastrsys.com/p/aB3xK9pQ');
  if (!out.includes('https://billing.mastrsys.com/p/')) out += ' https://billing.mastrsys.com/p/aB3xK9pQ';
  return out;
}

// Client-side mirror of the server transliteration (for the live preview).
const MN_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'ye', ё: 'yo', ж: 'j', з: 'z', и: 'i',
  й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'u', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: '', ы: 'y', ь: 'i', э: 'e', ю: 'yu', я: 'ya', '₮': 'T', '№': 'No',
};

function transliterate(text: string): string {
  let out = '';
  for (const ch of text) {
    const mapped = MN_LATIN[ch.toLowerCase()];
    if (mapped === undefined) out += ch;
    else if (ch === ch.toLowerCase()) out += mapped;
    else out += mapped.charAt(0).toUpperCase() + mapped.slice(1);
  }
  return out;
}

/** UCS-2 (кирилл): 70/67 · GSM-7 (латин): 160/153 chars per segment. */
function segmentEstimate(text: string, latin: boolean): number {
  const single = latin ? 160 : 70;
  const multi = latin ? 153 : 67;
  if (text.length <= single) return 1;
  return Math.ceil(text.length / multi);
}

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

export default function SettingsPage() {
  const [info, setInfo] = useState<TenantInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [regNo, setRegNo] = useState('');
  const [tin, setTin] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [smsTemplate, setSmsTemplate] = useState('');
  const [smsLatin, setSmsLatin] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<IntegrationRequest[]>([]);
  const [requestBusy, setRequestBusy] = useState<IntegrationKind | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [bonumSecret, setBonumSecret] = useState('');
  const [bonumChecksum, setBonumChecksum] = useState('');
  // Bonum анкет + eBarimt ТЕГ бүртгэлийн талбарууд
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [ebMerchantTin, setEbMerchantTin] = useState('');
  const [ebPosNo, setEbPosNo] = useState('');
  const [ebBranchNo, setEbBranchNo] = useState('');
  const [ebDistrictCode, setEbDistrictCode] = useState('');
  const [bonumTerminalId, setBonumTerminalId] = useState('');

  const loadRequests = useCallback(() => {
    api<{ items: IntegrationRequest[] }>('/integrations/requests')
      .then((r) => setRequests(r.items))
      .catch(() => undefined);
  }, []);
  const isOwner = getSessionUser()?.role === 'OWNER';
  const myUserId = getSessionUser()?.id;

  // Team management (M-23)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: '', name: '', role: 'OPERATOR' as Role });
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [teamBusy, setTeamBusy] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);

  const load = useCallback((first = false) => {
    api<TenantInfo>('/tenant')
      .then((r) => {
        setInfo(r);
        if (first) {
          setName(r.tenant.name);
          setPrefix(r.tenant.invoicePrefix);
          setRegNo(r.tenant.regNo ?? '');
          setTin(r.tenant.tin ?? '');
          setSmsTemplate(r.tenant.smsTemplate ?? '');
          setSmsLatin(r.tenant.smsTransliterate === true);
          setAddress(r.tenant.address ?? '');
          setContactPhone(r.tenant.contactPhone ?? '');
          setBankName(r.tenant.bankName ?? '');
          setBankAccount(r.tenant.bankAccount ?? '');
          setBankAccountName(r.tenant.bankAccountName ?? '');
          setEbMerchantTin(r.tenant.ebarimtMerchantTin ?? '');
          setEbPosNo(r.tenant.ebarimtPosNo ?? '');
          setEbBranchNo(r.tenant.ebarimtBranchNo ?? '');
          setEbDistrictCode(r.tenant.ebarimtDistrictCode ?? '');
          setBonumTerminalId(r.tenant.bonumTerminalId ?? '');
        }
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

  useEffect(() => {
    load(true);
  }, [load]);

  async function sendInvite() {
    setTeamBusy('invite');
    setTeamError(null);
    try {
      const res = await api<{ membership: unknown; tempPassword: string | null }>('/tenant/members', {
        method: 'POST',
        body: JSON.stringify({ email: invite.email.trim(), name: invite.name.trim(), role: invite.role }),
      });
      setTempPassword(res.tempPassword);
      if (!res.tempPassword) setInviteOpen(false);
      setInvite({ email: '', name: '', role: 'OPERATOR' });
      load();
    } catch (e) {
      setTeamError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setTeamBusy(null);
    }
  }

  async function changeRole(membershipId: string, role: Role) {
    setTeamBusy(membershipId);
    setTeamError(null);
    try {
      await api(`/tenant/members/${membershipId}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      load();
    } catch (e) {
      setTeamError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setTeamBusy(null);
    }
  }

  async function removeMember(membershipId: string, email: string) {
    if (!window.confirm(`${email} хэрэглэгчийг багаас хасах уу?`)) return;
    setTeamBusy(membershipId);
    setTeamError(null);
    try {
      await api(`/tenant/members/${membershipId}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setTeamError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setTeamBusy(null);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api('/tenant', {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          invoicePrefix: prefix.trim().toUpperCase(),
          regNo: regNo.trim() || undefined,
          tin: tin.trim() || undefined,
          smsTemplate,
          smsTransliterate: smsLatin,
          address: address.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          bankName: bankName.trim() || undefined,
          bankAccount: bankAccount.trim() || undefined,
          bankAccountName: bankAccountName.trim() || undefined,
          ebarimtMerchantTin: ebMerchantTin.trim() || undefined,
          ebarimtPosNo: ebPosNo.trim() || undefined,
          ebarimtBranchNo: ebBranchNo.trim() || undefined,
          ebarimtDistrictCode: ebDistrictCode.trim() || undefined,
          bonumTerminalId: bonumTerminalId.trim() || undefined,
          bonumAppSecret: bonumSecret.trim() || undefined,
          bonumChecksumKey: bonumChecksum.trim() || undefined,
        }),
      });
      setSaved(true);
      setBonumSecret('');
      setBonumChecksum('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  /** Регистрээр НӨАТ-ын бүртгэлээс нэр + ТТД татаж бөглөнө. */
  async function lookupRegNo() {
    setLooking(true);
    setLookupNote(null);
    try {
      const res = await api<{ found: boolean; name: string | null; tin: string | null }>(
        `/tenant/ebarimt-info?regNo=${encodeURIComponent(regNo.trim())}`,
      );
      if (res.found) {
        if (res.tin) setTin(res.tin);
        if (res.name) setName(res.name);
        setLookupNote(`✓ НӨАТ-ын бүртгэл: ${res.name ?? '—'}${res.tin ? ` · ТТД ${res.tin}` : ''}`);
      } else {
        setLookupNote('Энэ регистрээр НӨАТ-ын бүртгэлд олдсонгүй.');
      }
    } catch (e) {
      setLookupNote(e instanceof ApiError ? e.message : 'Шалгаж чадсангүй');
    } finally {
      setLooking(false);
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
          {isOwner && ['DRAFT', 'NEEDS_INFO', 'REJECTED'].includes(info.tenant.kybStatus) && (
            <>
              {' · '}
              <Link href="/onboarding" className="font-semibold text-indigo-600 hover:underline">
                Баталгаажуулалт бөглөх →
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="card space-y-5 p-6">
        <h2 className="font-bold text-slate-900">Байгууллага</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label">Нэр</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} maxLength={200} />
          </div>
          <div>
            <label className="label">Нэхэмжлэхийн prefix</label>
            <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} disabled={!isOwner} maxLength={8} />
            <p className="mt-1 text-[12px] text-slate-500">Жишээ: {prefix || 'INV'}-00042</p>
          </div>
          <div>
            <label className="label">Регистрийн дугаар</label>
            <div className="flex gap-2">
              <input className="input" value={regNo} onChange={(e) => setRegNo(e.target.value)} disabled={!isOwner} maxLength={20} placeholder="1234567" />
              {isOwner && (
                <button type="button" className="btn-secondary shrink-0 px-3 text-[12.5px]" onClick={lookupRegNo} disabled={looking || regNo.trim().length < 7}>
                  {looking ? '…' : '🔍 Шалгах'}
                </button>
              )}
            </div>
            <p className="mt-1 text-[12px] text-slate-500">eBarimt баримт үүсгэхэд ашиглагдана</p>
          </div>
          <div>
            <label className="label">Татвар төлөгчийн дугаар (ТТД)</label>
            <input className="input" value={tin} onChange={(e) => setTin(e.target.value)} disabled={!isOwner} maxLength={20} placeholder="Шалгах товчоор автоматаар бөглөгдөнө" />
          </div>
        </div>
        {lookupNote && (
          <p className={`rounded-lg px-4 py-2.5 text-[13px] font-medium ${lookupNote.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            {lookupNote}
          </p>
        )}
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
        {/* Кирилл / Латин: латин нь GSM-7 тул segment 70→160 тэмдэгт болж зардал ~2 дахин хэмнэнэ */}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-navy-50 px-4 py-3">
          <div>
            <p className="text-[13.5px] font-semibold text-navy-900">Илгээх үсгийн сонголт</p>
            <p className="text-[12px] text-navy-600">Латинаар илгээвэл 1 segment = 160 тэмдэгт (кирилл 70) — зардал ~2 дахин хэмнэнэ</p>
          </div>
          <div className="flex shrink-0 gap-1 rounded-full bg-white p-1">
            <button
              type="button"
              disabled={!isOwner}
              onClick={() => setSmsLatin(false)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition ${!smsLatin ? 'bg-navy-900 text-white' : 'text-navy-600'}`}
            >
              Кирилл
            </button>
            <button
              type="button"
              disabled={!isOwner}
              onClick={() => setSmsLatin(true)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition ${smsLatin ? 'bg-teal-500 text-white' : 'text-navy-600'}`}
            >
              Латин 💰
            </button>
          </div>
        </div>
        {(() => {
          const raw = templatePreview(smsTemplate);
          const shown = smsLatin ? transliterate(raw) : raw;
          const seg = segmentEstimate(shown, smsLatin);
          const segCyr = segmentEstimate(raw, false);
          return (
            <div className="rounded-xl bg-navy-900 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-navy-300">Урьдчилсан харагдац {smsLatin && '· латин'}</p>
              <p className="mt-2 rounded-lg bg-white/10 px-3.5 py-3 text-[13.5px] leading-relaxed text-white">{shown}</p>
              <p className="mt-2 text-right text-[12px] text-navy-300">
                {shown.length} тэмдэгт ≈ <b className="text-teal-300">{seg} segment</b> ({seg * 25}₮)
                {smsLatin && segCyr > seg && <span className="ml-1.5 rounded-full bg-teal-500/20 px-2 py-0.5 font-bold text-teal-300">−{(segCyr - seg) * 25}₮ хэмнэлт</span>}
              </p>
            </div>
          );
        })()}
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

      {/* Bonum Gateway анкет + eBarimt ТЕГ бүртгэл + интеграцийн хүсэлт */}
      <div className="card space-y-5 p-6">
        <div>
          <h2 className="font-bold text-slate-900">Байгууллагын дэлгэрэнгүй ба данс</h2>
          <p className="mt-1 text-[13px] text-slate-500">Bonum Gateway-д мерчант бүртгүүлэхэд (анкет) хаяг, утас, дансны мэдээлэл заавал шаардлагатай.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Хаяг</label>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!isOwner} maxLength={300} placeholder="Байгууллагын албан ёсны хаяг" />
          </div>
          <div>
            <label className="label">Утас</label>
            <input className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={!isOwner} maxLength={30} />
          </div>
          <div>
            <label className="label">Банк</label>
            <input className="input" value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={!isOwner} maxLength={100} placeholder="Хаан банк" />
          </div>
          <div>
            <label className="label">Дансны дугаар</label>
            <input className="input" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} disabled={!isOwner} maxLength={30} />
          </div>
          <div>
            <label className="label">Дансны нэр</label>
            <input className="input" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} disabled={!isOwner} maxLength={150} placeholder="Байгууллагын нэр дээрх данс" />
          </div>
        </div>
      </div>

      <div className="card space-y-5 p-6">
        <div>
          <h2 className="font-bold text-slate-900">eBarimt бүртгэл (ТЕГ POS API)</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Компани ТЕГ-т өөрийн POS-оор бүртгүүлсэн байх ёстой — өөрийн merchantTin болон тухайн POS-д олгогдсон posNo. Өөр байгууллагын posNo-г ашиглаж болохгүй.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label">Merchant TIN</label>
            <input className="input" value={ebMerchantTin} onChange={(e) => setEbMerchantTin(e.target.value)} disabled={!isOwner} maxLength={20} placeholder="ТЕГ-ийн ТТД (TIN)" />
          </div>
          <div>
            <label className="label">POS дугаар (posNo)</label>
            <input className="input" value={ebPosNo} onChange={(e) => setEbPosNo(e.target.value)} disabled={!isOwner} maxLength={20} />
          </div>
          <div>
            <label className="label">Салбарын дугаар (branchNo)</label>
            <input className="input" value={ebBranchNo} onChange={(e) => setEbBranchNo(e.target.value)} disabled={!isOwner} maxLength={10} placeholder="001" />
          </div>
          <div>
            <label className="label">Дүүргийн код (districtCode)</label>
            <input className="input" value={ebDistrictCode} onChange={(e) => setEbDistrictCode(e.target.value)} disabled={!isOwner} maxLength={10} placeholder="3505" />
          </div>
        </div>
      </div>

      <div className="card space-y-5 p-6">
        <div>
          <h2 className="font-bold text-slate-900">Bonum холболт (Terminal)</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Bonum-ийн гэрээ баталгаажсаны дараа имэйлээр ирсэн Terminal ID, Secret Key, Checksum Key-г энд оруулна. Нууц түлхүүрүүд шифрлэгдэж хадгалагдах бөгөөд дахин харагдахгүй.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className="label">Terminal ID</label>
            <input className="input" value={bonumTerminalId} onChange={(e) => setBonumTerminalId(e.target.value)} disabled={!isOwner} maxLength={30} />
          </div>
          <div>
            <label className="label">Secret Key {info.tenant.hasBonumAppSecret && <span className="text-emerald-600">✓</span>}</label>
            <input className="input" type="password" value={bonumSecret} onChange={(e) => setBonumSecret(e.target.value)} disabled={!isOwner} autoComplete="new-password" placeholder={info.tenant.hasBonumAppSecret ? '•••••• (солих бол шинээр)' : ''} />
          </div>
          <div>
            <label className="label">Checksum Key {info.tenant.hasBonumChecksumKey && <span className="text-emerald-600">✓</span>}</label>
            <input className="input" type="password" value={bonumChecksum} onChange={(e) => setBonumChecksum(e.target.value)} disabled={!isOwner} autoComplete="new-password" placeholder={info.tenant.hasBonumChecksumKey ? '•••••• (солих бол шинээр)' : ''} />
          </div>
        </div>
        {isOwner && (
          <div className="flex justify-end">
            <button className="btn-primary min-w-[130px]" onClick={save} disabled={busy}>
              {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Хадгалах'}
            </button>
          </div>
        )}
      </div>

      {/* Бүртгүүлэх хүсэлтүүд — Bonum/LIME талд автомат бүртгэл байхгүй тул
          хүсэлтийг имэйлээр илгээж, хариу ирмэгц админ баталгаажуулна */}
      <div className="card space-y-4 p-6">
        <div>
          <h2 className="font-bold text-slate-900">Интеграцийн бүртгэлийн хүсэлт</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Дээрх мэдээллээ <b>үнэн зөв, гүйцэд</b> хадгалсны дараа хүсэлтээ илгээнэ. Бид таны мэдээллийг Bonum / eBarimt (LIME) талд имэйлээр дамжуулж, бүртгэл хийгдмэгц энд төлөв нь шинэчлэгдэнэ.
          </p>
        </div>
        {(['BONUM', 'EBARIMT'] as IntegrationKind[]).map((kind) => {
          const latest = requests.find((r) => r.kind === kind);
          const st = latest ? REQUEST_STATUS_MN[latest.status] : null;
          const canSubmit = isOwner && (!latest || latest.status === 'REJECTED');
          return (
            <div key={kind} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <div>
                <p className="font-semibold text-slate-900">{kind === 'BONUM' ? 'Bonum Gateway — төлбөр хүлээн авах' : 'eBarimt (ТЕГ POS API, LIME)'}</p>
                {latest ? (
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${st!.cls}`}>{st!.label}</span>
                    <span className="ml-2">{shortDate(latest.createdAt)}</span>
                    {latest.note && <span className="ml-2">— {latest.note}</span>}
                  </p>
                ) : (
                  <p className="mt-1 text-[12.5px] text-slate-500">Хүсэлт илгээгээгүй байна</p>
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

      {/* Team management (M-23) */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="font-bold text-slate-900">Багийн гишүүд</h2>
          {isOwner && (
            <button className="btn-primary px-4 py-2 text-[13.5px]" onClick={() => setInviteOpen(true)}>
              + Гишүүн урих
            </button>
          )}
        </div>
        {teamError && <div className="px-6 pb-3"><ErrorNote message={teamError} /></div>}
        <table className="w-full border-t border-slate-200/60">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="th">Нэр</th>
              <th className="th">Имэйл</th>
              <th className="th">Эрх</th>
              <th className="th">Нэгдсэн</th>
              {isOwner && <th className="th" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60">
            {info.team.map((m) => (
              <tr key={m.id}>
                <td className="td font-medium">
                  {m.user.name}
                  {m.user.id === myUserId && <span className="ml-1.5 text-[11.5px] font-semibold text-indigo-500">(та)</span>}
                </td>
                <td className="td text-slate-500">{m.user.email}</td>
                <td className="td">
                  {isOwner && m.user.id !== myUserId ? (
                    <select
                      className="input w-auto px-2.5 py-1.5 text-[13px]"
                      value={m.role}
                      disabled={teamBusy === m.id}
                      onChange={(e) => changeRole(m.id, e.target.value as Role)}
                      aria-label={`${m.user.email} эрх`}
                    >
                      {(['OWNER', 'OPERATOR', 'ACCOUNTANT', 'VIEWER'] as Role[]).map((r) => (
                        <option key={r} value={r}>{ROLE_MN[r]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full bg-navy-50 px-2.5 py-1 text-[12px] font-semibold text-navy-700">{ROLE_MN[m.role] ?? m.role}</span>
                  )}
                </td>
                <td className="td text-slate-500">{shortDate(m.since)}</td>
                {isOwner && (
                  <td className="td text-right">
                    {m.user.id !== myUserId && (
                      <button
                        className="text-[13px] font-semibold text-red-600 hover:underline disabled:opacity-50"
                        disabled={teamBusy === m.id}
                        onClick={() => removeMember(m.id, m.user.email)}
                      >
                        Хасах
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite modal — temp password shown exactly once */}
      <Modal
        open={inviteOpen}
        title={tempPassword ? 'Гишүүн нэмэгдлээ' : 'Гишүүн урих'}
        onClose={() => {
          setInviteOpen(false);
          setTempPassword(null);
        }}
      >
        {tempPassword ? (
          <div className="space-y-4">
            <p className="text-[13.5px] leading-relaxed text-slate-600">
              Шинэ хэрэглэгчийн түр нууц үг — <b>зөвхөн одоо нэг удаа</b> харагдана. Гишүүндээ дамжуулж, нэвтэрсний дараа солиулаарай.
            </p>
            <div className="rounded-xl bg-navy-900 p-4">
              <code className="break-all font-mono text-[15px] font-bold text-teal-300">{tempPassword}</code>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => { setInviteOpen(false); setTempPassword(null); }}>Хадгалсан, хаах</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label">Имэйл</label>
              <input className="input" type="email" value={invite.email} onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))} placeholder="member@company.mn" />
            </div>
            <div>
              <label className="label">Нэр</label>
              <input className="input" value={invite.name} onChange={(e) => setInvite((v) => ({ ...v, name: e.target.value }))} maxLength={120} />
            </div>
            <div>
              <label className="label">Эрх</label>
              <select className="input" value={invite.role} onChange={(e) => setInvite((v) => ({ ...v, role: e.target.value as Role }))}>
                {(['OWNER', 'OPERATOR', 'ACCOUNTANT', 'VIEWER'] as Role[]).map((r) => (
                  <option key={r} value={r}>{ROLE_MN[r]}</option>
                ))}
              </select>
              <p className="mt-1 text-[12px] text-slate-500">Оператор — нэхэмжлэх илгээнэ · Нягтлан — тайлан, тулгалт · Үзэгч — зөвхөн харна</p>
            </div>
            {teamError && <ErrorNote message={teamError} />}
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setInviteOpen(false)}>Болих</button>
              <button
                className="btn-primary min-w-[120px]"
                disabled={teamBusy === 'invite' || !invite.email.trim() || !invite.name.trim()}
                onClick={sendInvite}
              >
                {teamBusy === 'invite' ? <Spinner className="h-5 w-5 text-white" /> : 'Урих'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
