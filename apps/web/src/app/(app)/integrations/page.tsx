'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';

interface QpayView {
  enabled: boolean;
  source: 'db' | 'env' | 'none';
  baseUrl: string;
  username: string;
  passwordMask: string | null;
  invoiceCode: string;
  configured: boolean;
}

interface CallproView {
  enabled: boolean;
  source: 'db' | 'env' | 'none';
  baseUrl: string;
  apiKeyMask: string | null;
  from: string;
  configured: boolean;
}

interface Integrations {
  qpay: QpayView;
  callpro: CallproView;
}

interface TestResult {
  ok: boolean;
  httpStatus: number | null;
  message_mn: string;
}

const SOURCE_MN: Record<string, string> = {
  db: 'UI-аас хадгалсан',
  env: 'Серверийн .env-ээс',
  none: 'Тохируулаагүй',
};

function StatusPill({ enabled, configured }: { enabled: boolean; configured: boolean }) {
  if (enabled && configured)
    return <span className="rounded-full bg-teal-50 px-3 py-1 text-[12px] font-bold text-teal-700 ring-1 ring-inset ring-teal-200">Идэвхтэй</span>;
  if (configured)
    return <span className="rounded-full bg-amber-50 px-3 py-1 text-[12px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">Унтраасан</span>;
  return <span className="rounded-full bg-navy-50 px-3 py-1 text-[12px] font-bold text-navy-500 ring-1 ring-inset ring-navy-200">Тохируулаагүй</span>;
}

export default function IntegrationsPage() {
  const [data, setData] = useState<Integrations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = getSessionUser()?.role === 'OWNER';

  // QPay form
  const [qForm, setQForm] = useState({ username: '', password: '', invoiceCode: '' });
  const [qBusy, setQBusy] = useState(false);
  const [qTest, setQTest] = useState<TestResult | null>(null);
  const [qTesting, setQTesting] = useState(false);

  // CallPro form
  const [cForm, setCForm] = useState({ apiKey: '', from: '' });
  const [cBusy, setCBusy] = useState(false);
  const [cTest, setCTest] = useState<TestResult | null>(null);
  const [cTesting, setCTesting] = useState(false);

  const load = useCallback(() => {
    api<Integrations>('/integrations')
      .then((d) => {
        setData(d);
        setQForm((f) => ({ ...f, username: d.qpay.username, invoiceCode: d.qpay.invoiceCode }));
        setCForm((f) => ({ ...f, from: d.callpro.from }));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveQpay(enabled: boolean) {
    setQBusy(true);
    setError(null);
    try {
      const d = await api<Integrations>('/integrations/QPAY', {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          username: qForm.username.trim() || undefined,
          password: qForm.password || undefined,
          invoiceCode: qForm.invoiceCode.trim() || undefined,
        }),
      });
      setData(d);
      setQForm((f) => ({ ...f, password: '' }));
      setQTest(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setQBusy(false);
    }
  }

  async function saveCallpro(enabled: boolean) {
    setCBusy(true);
    setError(null);
    try {
      const d = await api<Integrations>('/integrations/CALLPRO', {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          apiKey: cForm.apiKey || undefined,
          from: cForm.from.trim() || undefined,
        }),
      });
      setData(d);
      setCForm((f) => ({ ...f, apiKey: '' }));
      setCTest(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setCBusy(false);
    }
  }

  async function runTest(code: 'QPAY' | 'CALLPRO') {
    const setT = code === 'QPAY' ? setQTest : setCTest;
    const setB = code === 'QPAY' ? setQTesting : setCTesting;
    setB(true);
    setT(null);
    try {
      setT(await api<TestResult>(`/integrations/${code}/test`, { method: 'POST' }));
    } catch (e) {
      setT({ ok: false, httpStatus: null, message_mn: e instanceof ApiError ? e.message : 'Шалгалт амжилтгүй' });
    } finally {
      setB(false);
    }
  }

  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <PageLoader />;

  if (!isOwner) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Интеграци</h1>
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Интеграцийн тохиргоог зөвхөн байгууллагын эзэмшигч удирдана.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Интеграци</h1>
        <p className="mt-1 text-sm text-muted">
          Төлбөр, SMS-ийн холболтуудаа эндээс удирдана. Нууц утгууд серверт шифрлэгдэж хадгалагдана — энд дахин харагдахгүй.
        </p>
      </div>

      {error && <ErrorNote message={error} />}

      {/* QPay */}
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-lg font-black text-white">Q</span>
            <div>
              <h2 className="font-bold text-navy-900">QPay Merchant V2</h2>
              <p className="text-[12.5px] text-muted">Төлбөрийн QR, банкны апп · {SOURCE_MN[data.qpay.source]}</p>
            </div>
          </div>
          <StatusPill enabled={data.qpay.enabled} configured={data.qpay.configured} />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Username (client_id)</label>
            <input className="input" value={qForm.username} onChange={(e) => setQForm((f) => ({ ...f, username: e.target.value }))} placeholder="LAWTUS_MN" />
          </div>
          <div>
            <label className="label">Password {data.qpay.passwordMask && <span className="text-muted">({data.qpay.passwordMask})</span>}</label>
            <input type="password" className="input" value={qForm.password} onChange={(e) => setQForm((f) => ({ ...f, password: e.target.value }))} placeholder="Солих бол шинээр бичнэ" autoComplete="new-password" />
          </div>
          <div>
            <label className="label">Invoice code</label>
            <input className="input" value={qForm.invoiceCode} onChange={(e) => setQForm((f) => ({ ...f, invoiceCode: e.target.value }))} placeholder="LAWTUS_MN_INVOICE" />
          </div>
        </div>

        {qTest && (
          <p className={`mt-4 rounded-lg px-4 py-2.5 text-sm font-medium ${qTest.ok ? 'bg-teal-50 text-teal-800' : 'bg-red-50 text-red-700'}`}>
            {qTest.ok ? '✅' : '❌'} {qTest.message_mn} {qTest.httpStatus ? `(HTTP ${qTest.httpStatus})` : ''}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <button onClick={() => runTest('QPAY')} disabled={qTesting} className="btn-secondary">
            {qTesting ? <Spinner className="h-4 w-4" /> : '🔌 Холболт шалгах'}
          </button>
          <div className="flex gap-3">
            {data.qpay.enabled ? (
              <button onClick={() => saveQpay(false)} disabled={qBusy} className="btn-danger">Унтраах</button>
            ) : (
              <button onClick={() => saveQpay(true)} disabled={qBusy} className="btn-primary">
                {qBusy ? <Spinner className="h-4 w-4 text-white" /> : 'Хадгалж идэвхжүүлэх'}
              </button>
            )}
            {data.qpay.enabled && (
              <button onClick={() => saveQpay(true)} disabled={qBusy} className="btn-primary">
                {qBusy ? <Spinner className="h-4 w-4 text-white" /> : 'Хадгалах'}
              </button>
            )}
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-snug text-muted">
          Унтраахад төлбөр туршилтын (mock) горимд шилжинэ — бодит мөнгө хөдлөхгүй. Идэвхтэй үед төлөгчид жинхэнэ QPay QR очно.
        </p>
      </div>

      {/* CallPro */}
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500 text-lg font-black text-white">C</span>
            <div>
              <h2 className="font-bold text-navy-900">CallPro Text API</h2>
              <p className="text-[12.5px] text-muted">SMS илгээлт · {SOURCE_MN[data.callpro.source]}</p>
            </div>
          </div>
          <StatusPill enabled={data.callpro.enabled} configured={data.callpro.configured} />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">API key {data.callpro.apiKeyMask && <span className="text-muted">({data.callpro.apiKeyMask})</span>}</label>
            <input type="password" className="input" value={cForm.apiKey} onChange={(e) => setCForm((f) => ({ ...f, apiKey: e.target.value }))} placeholder="Солих бол шинээр бичнэ" autoComplete="new-password" />
          </div>
          <div>
            <label className="label">Илгээгч дугаар (from)</label>
            <input className="input" value={cForm.from} onChange={(e) => setCForm((f) => ({ ...f, from: e.target.value }))} placeholder="72225700" />
          </div>
        </div>

        {cTest && (
          <p className={`mt-4 rounded-lg px-4 py-2.5 text-sm font-medium ${cTest.ok ? 'bg-teal-50 text-teal-800' : 'bg-red-50 text-red-700'}`}>
            {cTest.ok ? '✅' : '❌'} {cTest.message_mn} {cTest.httpStatus ? `(HTTP ${cTest.httpStatus})` : ''}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <button onClick={() => runTest('CALLPRO')} disabled={cTesting} className="btn-secondary">
            {cTesting ? <Spinner className="h-4 w-4" /> : '🔌 Холболт шалгах'}
          </button>
          <div className="flex gap-3">
            {data.callpro.enabled ? (
              <button onClick={() => saveCallpro(false)} disabled={cBusy} className="btn-danger">Унтраах</button>
            ) : (
              <button onClick={() => saveCallpro(true)} disabled={cBusy} className="btn-primary">
                {cBusy ? <Spinner className="h-4 w-4 text-white" /> : 'Хадгалж идэвхжүүлэх'}
              </button>
            )}
            {data.callpro.enabled && (
              <button onClick={() => saveCallpro(true)} disabled={cBusy} className="btn-primary">
                {cBusy ? <Spinner className="h-4 w-4 text-white" /> : 'Хадгалах'}
              </button>
            )}
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-snug text-muted">
          Унтраахад SMS mock горимд бичигдэнэ (бодит илгээлт хийгдэхгүй). Мессежийн бүтцийг Тохиргоо → Мессежийн загвар хэсгээс өөрчилнө.
        </p>
      </div>
    </div>
  );
}
