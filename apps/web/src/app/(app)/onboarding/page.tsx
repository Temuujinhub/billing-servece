'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';
import type { TenantInfo } from '@/lib/types';

const KYB_MN: Record<string, string> = {
  DRAFT: 'Ноорог',
  SUBMITTED: 'Илгээсэн — хянагдаж байна',
  UNDER_REVIEW: 'Хянагдаж байна',
  APPROVED: 'Баталгаажсан',
  REJECTED: 'Татгалзсан',
  NEEDS_INFO: 'Мэдээлэл дутуу — засаад дахин илгээнэ үү',
};

const STEPS = ['Байгууллага', 'Банкны данс', 'eBarimt', 'Баталгаажуулалт'];

interface EbarimtInfo {
  regNo: string;
  found: boolean;
  name: string | null;
  tin: string | null;
}

/** M-03: KYB onboarding wizard — fill the org profile, submit for review. */
export default function OnboardingPage() {
  const router = useRouter();
  const [info, setInfo] = useState<TenantInfo | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const isOwner = getSessionUser()?.role === 'OWNER';

  const [form, setForm] = useState({
    name: '',
    regNo: '',
    address: '',
    representative: '',
    bankName: '',
    bankAccount: '',
  });

  // eBarimt step state
  const [ebarimt, setEbarimt] = useState<EbarimtInfo | null>(null);
  const [ebarimtWanted, setEbarimtWanted] = useState(true);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    api<TenantInfo>('/tenant')
      .then((r) => {
        setInfo(r);
        setForm({
          name: r.tenant.name ?? '',
          regNo: r.tenant.regNo ?? '',
          address: r.tenant.address ?? '',
          representative: r.tenant.representative ?? '',
          bankName: r.tenant.bankName ?? '',
          bankAccount: r.tenant.bankAccount ?? '',
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveStep(next: number) {
    setBusy(true);
    setError(null);
    try {
      await api('/tenant', {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim() || undefined,
          regNo: form.regNo.trim() || undefined,
          address: form.address.trim() || undefined,
          representative: form.representative.trim() || undefined,
          bankName: form.bankName.trim() || undefined,
          bankAccount: form.bankAccount.trim() || undefined,
        }),
      });
      setStep(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  /** Регистрийн дугаараар НӨАТ-ын нээлттэй бүртгэлээс нэр + ТТД татна. */
  async function lookupEbarimt() {
    setLooking(true);
    setLookupError(null);
    setEbarimt(null);
    try {
      const res = await api<EbarimtInfo>(`/tenant/ebarimt-info?regNo=${encodeURIComponent(form.regNo.trim())}`);
      setEbarimt(res);
      if (res.name && !form.name.trim()) set('name', res.name);
    } catch (e) {
      setLookupError(e instanceof ApiError ? e.message : 'Шалгаж чадсангүй');
    } finally {
      setLooking(false);
    }
  }

  /** eBarimt алхам: хүсэлтэй бол модулийг идэвхжүүлж regNo/ТТД хадгална. */
  async function saveEbarimtStep() {
    setBusy(true);
    setError(null);
    try {
      if (ebarimtWanted) {
        await api('/tenant/ebarimt-request', {
          method: 'POST',
          body: JSON.stringify({ regNo: form.regNo.trim(), tin: ebarimt?.tin ?? undefined }),
        });
      }
      setStep(3);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api('/tenant/kyb-submit', { method: 'POST' });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  }

  if (error && !info) return <ErrorNote message={error} />;
  if (!info) return <PageLoader />;

  const status = info.tenant.kybStatus;
  const step1Ok = form.name.trim().length > 1 && form.regNo.trim().length >= 7;
  const step2Ok = form.bankName.trim().length > 1 && form.bankAccount.trim().length >= 8;

  if (done || status === 'SUBMITTED' || status === 'UNDER_REVIEW' || status === 'APPROVED') {
    return (
      <div className="mx-auto max-w-xl">
        <div className="card p-8 text-center">
          <p className="text-4xl">{status === 'APPROVED' ? '✅' : '🕓'}</p>
          <h1 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">
            {status === 'APPROVED' ? 'Баталгаажуулалт амжилттай' : 'Мэдээлэл илгээгдлээ'}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
            {status === 'APPROVED'
              ? 'Танай байгууллага бүрэн баталгаажсан тул бүх боломж нээлттэй.'
              : 'Манай баг байгууллагын мэдээллийг 1 ажлын өдөрт багтаан хянана. Энэ хооронд системээ чөлөөтэй ашиглаж болно.'}
          </p>
          <button className="btn-primary mt-6" onClick={() => router.push('/dashboard')}>Хянах самбар руу</button>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="card p-8 text-center">
          <p className="text-4xl">🔒</p>
          <h1 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">Зөвхөн эзэмшигч</h1>
          <p className="mt-2 text-[14px] text-slate-500">Байгууллагын баталгаажуулалтыг зөвхөн эзэмшигч эрхтэй хэрэглэгч бөглөнө.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Байгууллага баталгаажуулах</h1>
        <p className="mt-1 text-sm text-slate-500">
          Одоогийн төлөв: <b className="text-navy-800">{KYB_MN[status] ?? status}</b>
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-indigo-600 text-white shadow-glow' : 'bg-navy-100 text-navy-500'
              }`}
            >
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`hidden text-[13px] font-semibold sm:block ${i === step ? 'text-slate-900' : 'text-slate-400'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 rounded ${i < step ? 'bg-emerald-400' : 'bg-navy-100'}`} />}
          </div>
        ))}
      </div>

      {error && <ErrorNote message={error} />}

      {step === 0 && (
        <div className="card space-y-5 p-6">
          <h2 className="font-bold text-slate-900">Байгууллагын мэдээлэл</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label">Албан ёсны нэр *</label>
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />
            </div>
            <div>
              <label className="label">Улсын бүртгэлийн дугаар *</label>
              <input className="input" value={form.regNo} onChange={(e) => set('regNo', e.target.value)} maxLength={20} placeholder="1234567" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Хаяг</label>
              <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={300} placeholder="Улаанбаатар, СБД, …" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Эрх бүхий төлөөлөгч</label>
              <input className="input" value={form.representative} onChange={(e) => set('representative', e.target.value)} maxLength={150} placeholder="Овог Нэр — Захирал" />
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary min-w-[140px]" disabled={busy || !step1Ok} onClick={() => saveStep(1)}>
              {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Үргэлжлүүлэх →'}
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card space-y-5 p-6">
          <div>
            <h2 className="font-bold text-slate-900">Банкны данс</h2>
            <p className="mt-1 text-[13px] text-slate-500">Цугласан төлбөрийн тайлан тулгалтад ашиглагдана.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label">Банк *</label>
              <input className="input" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} maxLength={100} placeholder="Хаан банк" />
            </div>
            <div>
              <label className="label">Дансны дугаар *</label>
              <input className="input" value={form.bankAccount} onChange={(e) => set('bankAccount', e.target.value)} maxLength={40} placeholder="5000000000" />
            </div>
          </div>
          <div className="flex justify-between">
            <button className="btn-secondary" disabled={busy} onClick={() => setStep(0)}>← Буцах</button>
            <button className="btn-primary min-w-[140px]" disabled={busy || !step2Ok} onClick={() => saveStep(2)}>
              {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Үргэлжлүүлэх →'}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card space-y-5 p-6">
          <div>
            <h2 className="font-bold text-slate-900">eBarimt үүсгүүлэх хүсэлт</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
              Төлбөр бүрд НӨАТ-ын баримт автоматаар үүсгэхийг хүсвэл регистрийн дугаараа НӨАТ-ын бүртгэлээс шалгаад хүсэлтээ илгээнэ.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="label">Регистрийн дугаар</label>
              <input className="input" value={form.regNo} onChange={(e) => { set('regNo', e.target.value); setEbarimt(null); }} maxLength={20} placeholder="1234567" />
            </div>
            <button className="btn-secondary min-w-[150px]" onClick={lookupEbarimt} disabled={looking || form.regNo.trim().length < 7}>
              {looking ? <Spinner className="h-5 w-5" /> : '🔍 НӨАТ-аас шалгах'}
            </button>
          </div>
          {lookupError && <ErrorNote message={lookupError} />}
          {ebarimt && (
            ebarimt.found ? (
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3.5">
                <p className="text-[12px] font-bold uppercase tracking-widest text-emerald-600">НӨАТ-ын бүртгэлээс олдлоо</p>
                <p className="mt-1.5 text-[15px] font-extrabold tracking-tight text-slate-900">{ebarimt.name ?? '— нэр бүртгэлгүй —'}</p>
                <p className="mt-0.5 text-[13.5px] text-slate-600">
                  Регистр: <b>{ebarimt.regNo}</b>
                  {ebarimt.tin && <> · Татвар төлөгчийн дугаар (ТТД): <b>{ebarimt.tin}</b></>}
                </p>
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] font-medium text-amber-800">
                Энэ регистрээр НӨАТ-ын бүртгэлд байгууллага олдсонгүй — дугаараа шалгаад дахин оролдоно уу.
              </p>
            )
          )}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-navy-50 px-4 py-3.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-indigo-600"
              checked={ebarimtWanted}
              onChange={(e) => setEbarimtWanted(e.target.checked)}
            />
            <span className="text-[13.5px] leading-relaxed text-navy-800">
              <b>eBarimt үүсгүүлэх хүсэлт илгээх</b> — амжилттай төлбөр бүрд НӨАТ-ын баримт автоматаар үүснэ (илгээлтийн үнэд багтсан).
            </span>
          </label>
          <div className="flex justify-between">
            <button className="btn-secondary" disabled={busy} onClick={() => setStep(1)}>← Буцах</button>
            <button
              className="btn-primary min-w-[140px]"
              disabled={busy || (ebarimtWanted && form.regNo.trim().length < 7)}
              onClick={saveEbarimtStep}
            >
              {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Үргэлжлүүлэх →'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card space-y-5 p-6">
          <h2 className="font-bold text-slate-900">Мэдээллээ шалгаад илгээнэ үү</h2>
          <dl className="divide-y divide-slate-200/60 text-[14px]">
            {[
              ['Нэр', form.name],
              ['Регистр', form.regNo],
              ['ТТД', ebarimt?.tin ?? '—'],
              ['eBarimt хүсэлт', ebarimtWanted ? '✓ Илгээнэ' : 'Илгээхгүй'],
              ['Хаяг', form.address || '—'],
              ['Төлөөлөгч', form.representative || '—'],
              ['Банк', form.bankName],
              ['Данс', form.bankAccount],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-semibold text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="rounded-xl bg-navy-50 px-4 py-3 text-[13px] leading-relaxed text-navy-700">
            Илгээснээр мэдээлэл үнэн зөв гэдгийг баталж, платформын үйлчилгээний нөхцөлийг зөвшөөрч байна.
          </p>
          <div className="flex justify-between">
            <button className="btn-secondary" disabled={busy} onClick={() => setStep(2)}>← Буцах</button>
            <button className="btn-primary min-w-[180px]" disabled={busy} onClick={submit}>
              {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Баталгаажуулалтад илгээх'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
