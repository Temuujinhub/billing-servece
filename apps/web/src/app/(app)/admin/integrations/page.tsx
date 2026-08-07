'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';

type Source = 'db' | 'env' | 'none';

interface BonumView {
  enabled: boolean;
  source: Source;
  baseUrl: string;
  terminalId: string;
  appSecretMask: string | null;
  checksumKeyMask: string | null;
  configured: boolean;
  hasChecksumKey: boolean;
}

interface EbarimtView {
  enabled: boolean;
  source: Source;
  baseUrl: string;
  merchantTin: string;
  posNo: string;
  branchNo: string;
  districtCode: string;
  configured: boolean;
  vatPayer: boolean | null;
  vatFreeProject: boolean | null;
  cityPayer: boolean | null;
}

interface District {
  code: string;
  label: string;
}

interface QpayView {
  enabled: boolean;
  source: Source;
  baseUrl: string;
  username: string;
  passwordMask: string | null;
  invoiceCode: string;
  configured: boolean;
}

interface CallproView {
  enabled: boolean;
  source: Source;
  baseUrl: string;
  apiKeyMask: string | null;
  from: string;
  configured: boolean;
}

interface Integrations {
  bonum: BonumView;
  ebarimt: EbarimtView;
  qpay: QpayView;
  callpro: CallproView;
}

interface TestResult {
  ok: boolean;
  httpStatus: number | null;
  message_mn: string;
}

type Code = 'BONUM' | 'EBARIMT' | 'QPAY' | 'CALLPRO';

interface PosRegistration {
  merchantTin: string | null;
  merchantName: string | null;
  branchNo: string | null;
  posNo: string;
}

interface SyncResult {
  ok: boolean;
  message_mn: string;
  applied: { posNo: string; branchNo: string } | null;
  options: PosRegistration[];
}

const SOURCE_MN: Record<Source, string> = {
  db: 'UI-аас хадгалсан',
  env: 'Серверийн .env-ээс',
  none: 'Тохируулаагүй',
};

function StatusPill({ enabled, configured }: { enabled: boolean; configured: boolean }) {
  if (enabled && configured)
    return <span className="rounded-full bg-teal-50 px-3 py-1 text-[12px] font-bold text-indigo-700 ring-1 ring-inset ring-teal-200">Идэвхтэй</span>;
  if (configured)
    return <span className="rounded-full bg-amber-50 px-3 py-1 text-[12px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">Унтраасан</span>;
  return <span className="rounded-full bg-navy-50 px-3 py-1 text-[12px] font-bold text-navy-500 ring-1 ring-inset ring-navy-200">Тохируулаагүй</span>;
}

function CardHead({
  badge,
  badgeClass,
  title,
  subtitle,
  view,
}: {
  badge: string;
  badgeClass: string;
  title: string;
  subtitle: string;
  view: { enabled: boolean; configured: boolean };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-black text-white ${badgeClass}`}>{badge}</span>
        <div>
          <h2 className="font-bold text-slate-900">{title}</h2>
          <p className="text-[12.5px] text-slate-500">{subtitle}</p>
        </div>
      </div>
      <StatusPill enabled={view.enabled} configured={view.configured} />
    </div>
  );
}

function TestNote({ result }: { result: TestResult | null }) {
  if (!result) return null;
  return (
    <p className={`mt-4 rounded-lg px-4 py-2.5 text-sm font-medium ${result.ok ? 'bg-teal-50 text-teal-800' : 'bg-red-50 text-red-700'}`}>
      {result.ok ? '✅' : '❌'} {result.message_mn} {result.httpStatus ? `(HTTP ${result.httpStatus})` : ''}
    </p>
  );
}

/** Шалгах + Хадгалах/Унтраах мөр — бүх картад ижил. */
function CardActions({
  enabled,
  busy,
  testing,
  onTest,
  onSave,
}: {
  enabled: boolean;
  busy: boolean;
  testing: boolean;
  onTest: () => void;
  onSave: (enabled: boolean) => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/60 pt-4">
      <button onClick={onTest} disabled={testing} className="btn-secondary">
        {testing ? <Spinner className="h-4 w-4" /> : '🔌 Холболт шалгах'}
      </button>
      <div className="flex gap-3">
        {enabled && (
          <button onClick={() => onSave(false)} disabled={busy} className="btn-danger">
            Унтраах
          </button>
        )}
        <button onClick={() => onSave(true)} disabled={busy} className="btn-primary">
          {busy ? <Spinner className="h-4 w-4 text-white" /> : enabled ? 'Хадгалах' : 'Хадгалж идэвхжүүлэх'}
        </button>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const [data, setData] = useState<Integrations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Code | null>(null);
  const [testing, setTesting] = useState<Code | null>(null);
  const [tests, setTests] = useState<Partial<Record<Code, TestResult>>>({});
  const isAdmin = getSessionUser()?.isAdmin === true;

  const [bForm, setBForm] = useState({ terminalId: '', appSecret: '', checksumKey: '' });
  const [eForm, setEForm] = useState({ merchantTin: '', posNo: '', branchNo: '', districtCode: '' });
  const [sync, setSync] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [districts, setDistricts] = useState<District[]>([]);
  const [merchantReq, setMerchantReq] = useState<{ ok: boolean; message_mn: string; details: string[] } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [qForm, setQForm] = useState({ username: '', password: '', invoiceCode: '' });
  const [cForm, setCForm] = useState({ apiKey: '', from: '' });

  const load = useCallback(() => {
    api<Integrations>('/integrations')
      .then((d) => {
        setData(d);
        setBForm((f) => ({ ...f, terminalId: d.bonum.terminalId }));
        setEForm({
          merchantTin: d.ebarimt.merchantTin,
          posNo: d.ebarimt.posNo,
          branchNo: d.ebarimt.branchNo,
          districtCode: d.ebarimt.districtCode,
        });
        setQForm((f) => ({ ...f, username: d.qpay.username, invoiceCode: d.qpay.invoiceCode }));
        setCForm((f) => ({ ...f, from: d.callpro.from }));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    // Байршлын кодын лавлах — олдохгүй бол талбар нь энгийн текст хэвээр.
    api<{ items: District[] }>('/tenant/districts')
      .then((d) => setDistricts(d.items ?? []))
      .catch(() => setDistricts([]));
  }, [load]);

  /** 4-р алхам: ТЕГ рүү мерчант бүртгүүлэх хүсэлт илгээнэ. */
  async function requestMerchant() {
    setRequesting(true);
    setMerchantReq(null);
    try {
      setMerchantReq(await api('/integrations/EBARIMT/merchant-request', { method: 'POST' }));
    } catch (e) {
      setMerchantReq({ ok: false, message_mn: e instanceof ApiError ? e.message : 'Илгээж чадсангүй', details: [] });
    } finally {
      setRequesting(false);
    }
  }

  /** Хадгалсны дараа нууц талбарууд цэвэрлэгдэж, шалгалтын үр дүн хүчингүй болно. */
  async function save(code: Code, body: Record<string, unknown>, clearSecrets: () => void) {
    setBusy(code);
    setError(null);
    try {
      setData(await api<Integrations>(`/integrations/${code}`, { method: 'PUT', body: JSON.stringify(body) }));
      clearSecrets();
      setTests((t) => ({ ...t, [code]: undefined }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Алдаа гарлаа');
    } finally {
      setBusy(null);
    }
  }

  /** ebarimt.mn дээр баталгаажсаны дараа POS дугаарыг татаж авна. */
  async function syncEbarimt() {
    setSyncing(true);
    setSync(null);
    try {
      const r = await api<SyncResult>('/integrations/EBARIMT/sync', { method: 'POST' });
      setSync(r);
      if (r.applied) {
        setEForm((f) => ({ ...f, posNo: r.applied!.posNo, branchNo: r.applied!.branchNo }));
        load();
      }
    } catch (e) {
      setSync({ ok: false, message_mn: e instanceof ApiError ? e.message : 'Татаж чадсангүй', applied: null, options: [] });
    } finally {
      setSyncing(false);
    }
  }

  async function runTest(code: Code) {
    setTesting(code);
    setTests((t) => ({ ...t, [code]: undefined }));
    try {
      const r = await api<TestResult>(`/integrations/${code}/test`, { method: 'POST' });
      setTests((t) => ({ ...t, [code]: r }));
    } catch (e) {
      setTests((t) => ({
        ...t,
        [code]: { ok: false, httpStatus: null, message_mn: e instanceof ApiError ? e.message : 'Шалгалт амжилтгүй' },
      }));
    } finally {
      setTesting(null);
    }
  }

  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <PageLoader />;

  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Интеграци</h1>
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Энэ хэсэгт зөвхөн платформын админ хандана.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Интеграци</h1>
        <p className="mt-1 text-sm text-slate-500">
          Төлбөр, баримт, SMS-ийн холболтуудаа эндээс удирдана. Нууц утгууд серверт шифрлэгдэж хадгалагдана — энд дахин харагдахгүй.
        </p>
        <p className="mt-1 text-[12.5px] text-slate-400">
          Энэ хуудас нь ӨӨРИЙН байгууллагын холболтыг тохируулна. Бусад байгууллагын холболтыг «Хүсэлтүүд» хуудсаар,
          партнёрын буцаасан утгыг бөглөж баталгаажуулснаар тохируулна.
        </p>
      </div>

      {error && <ErrorNote message={error} />}

      {/* Bonum төлбөрийн гарц */}
      <div className="card p-6">
        <CardHead
          badge="B"
          badgeClass="bg-indigo-600"
          title="Bonum төлбөрийн гарц"
          subtitle={`Картын төлбөр, төлбөрийн линк · ${SOURCE_MN[data.bonum.source]}`}
          view={data.bonum}
        />

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Терминалын дугаар</label>
            <input
              className="input"
              value={bForm.terminalId}
              onChange={(e) => setBForm((f) => ({ ...f, terminalId: e.target.value }))}
              placeholder="17173004"
            />
          </div>
          <div>
            <label className="label">
              Нууц түлхүүр (App Secret) {data.bonum.appSecretMask && <span className="text-slate-500">({data.bonum.appSecretMask})</span>}
            </label>
            <input
              type="password"
              className="input"
              value={bForm.appSecret}
              onChange={(e) => setBForm((f) => ({ ...f, appSecret: e.target.value }))}
              placeholder="Солих бол шинээр бичнэ"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label">
              Баталгаажуулах түлхүүр {data.bonum.checksumKeyMask && <span className="text-slate-500">({data.bonum.checksumKeyMask})</span>}
            </label>
            <input
              type="password"
              className="input"
              value={bForm.checksumKey}
              onChange={(e) => setBForm((f) => ({ ...f, checksumKey: e.target.value }))}
              placeholder="Солих бол шинээр бичнэ"
              autoComplete="new-password"
            />
          </div>
        </div>

        {data.bonum.configured && !data.bonum.hasChecksumKey && (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            ⚠️ Баталгаажуулах түлхүүр (checksum key) оруулаагүй байна. Үүнгүйгээр төлбөрийн мэдэгдлийн гарын үсгийг шалгаж
            чадахгүй тул нэхэмжлэх автоматаар төлөгдсөн болж тэмдэглэгдэхгүй.
          </p>
        )}

        <TestNote result={tests.BONUM ?? null} />
        <CardActions
          enabled={data.bonum.enabled}
          busy={busy === 'BONUM'}
          testing={testing === 'BONUM'}
          onTest={() => runTest('BONUM')}
          onSave={(enabled) =>
            save(
              'BONUM',
              {
                enabled,
                terminalId: bForm.terminalId.trim() || undefined,
                appSecret: bForm.appSecret || undefined,
                checksumKey: bForm.checksumKey || undefined,
              },
              () => setBForm((f) => ({ ...f, appSecret: '', checksumKey: '' })),
            )
          }
        />
        <p className="mt-3 text-[12px] leading-snug text-slate-500">
          Гарцын төлбөрийн линк богино хугацаанд хүчинтэй тул SMS-ээр манай өөрийн линк илгээгдэж, төлөгч дарах үед
          нэхэмжлэх төлөгдөөгүй бол шинэ линк дахин үүсгэгддэг. Унтраахад төлбөр туршилтын (mock) горимд шилжинэ — бодит
          мөнгө хөдлөхгүй.
        </p>
      </div>

      {/* eBarimt POS API */}
      <div className="card p-6">
        <CardHead
          badge="Е"
          badgeClass="bg-emerald-600"
          title="eBarimt (POS API 3.0)"
          subtitle={`Татварын баримт · ${data.ebarimt.baseUrl || 'хаяг тохируулаагүй'}`}
          view={data.ebarimt}
        />

        <div className="mt-5 grid gap-4 sm:grid-cols-4">
          <div>
            <label className="label">ТТД (merchantTin)</label>
            <input
              className="input"
              value={eForm.merchantTin}
              onChange={(e) => setEForm((f) => ({ ...f, merchantTin: e.target.value }))}
              placeholder="Регистрээр автоматаар"
            />
          </div>
          <div>
            <label className="label">POS дугаар</label>
            <input className="input" value={eForm.posNo} onChange={(e) => setEForm((f) => ({ ...f, posNo: e.target.value }))} placeholder="10000001" />
          </div>
          <div>
            <label className="label">Салбарын дугаар</label>
            <input className="input" value={eForm.branchNo} onChange={(e) => setEForm((f) => ({ ...f, branchNo: e.target.value }))} placeholder="001" />
          </div>
          <div>
            <label className="label">Байршил (дүүрэг/сум)</label>
            {districts.length > 0 ? (
              <select
                className="input"
                value={eForm.districtCode}
                onChange={(e) => setEForm((f) => ({ ...f, districtCode: e.target.value }))}
              >
                <option value="">— сонгоно уу —</option>
                {districts.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} · {d.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={eForm.districtCode}
                onChange={(e) => setEForm((f) => ({ ...f, districtCode: e.target.value }))}
                placeholder="0101"
              />
            )}
          </div>
        </div>

        {(data.ebarimt.vatPayer !== null || data.ebarimt.cityPayer !== null) && (
          <p className="mt-3 text-[12px] text-slate-500">
            ТЕГ-ийн бүртгэлээр:{' '}
            <span className="font-bold text-slate-700">
              {data.ebarimt.vatFreeProject
                ? 'НӨАТ-аас чөлөөлөгдөх төсөл'
                : data.ebarimt.vatPayer === false
                  ? 'НӨАТ суутган төлөгч БИШ'
                  : 'НӨАТ суутган төлөгч'}
            </span>
            {data.ebarimt.cityPayer === true && ' · НХАТ суутган төлөгч'} — баримтын татварын төрөл үүнээс шалтгаална.
          </p>
        )}

        <div className="mt-4 space-y-3 rounded-xl bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={requestMerchant} disabled={requesting} className="btn-secondary">
              {requesting ? <Spinner className="h-4 w-4" /> : '📨 ТЕГ-т бүртгүүлэх хүсэлт'}
            </button>
            <p className="flex-1 text-[12px] leading-snug text-slate-500">
              1) Хүсэлт илгээнэ → 2) байгууллага ebarimt.mn дээрээ баталгаажуулна → 3) доорх товчоор POS дугаараа татна.
            </p>
          </div>
          {merchantReq && (
            <div className={`rounded-lg px-3 py-2 text-[12.5px] ${merchantReq.ok ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-800'}`}>
              <p className="font-medium">
                {merchantReq.ok ? '✅' : '⚠️'} {merchantReq.message_mn}
              </p>
              {merchantReq.details.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {merchantReq.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={syncEbarimt} disabled={syncing} className="btn-secondary">
              {syncing ? <Spinner className="h-4 w-4" /> : '⬇️ POS дугаар татах'}
            </button>
            <p className="flex-1 text-[12px] leading-snug text-slate-500">
              Баталгаажсаны дараа дарна — салбар, POS дугаар болон НӨАТ-ын төлөв автоматаар шинэчлэгдэнэ.
            </p>
          </div>
        </div>

        {sync && (
          <div className={`mt-3 rounded-lg px-4 py-2.5 text-sm ${sync.ok ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-800'}`}>
            <p className="font-medium">
              {sync.ok ? '✅' : '⚠️'} {sync.message_mn}
            </p>
            {sync.options.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {sync.options.map((o) => (
                  <button
                    key={o.posNo}
                    onClick={() => setEForm((f) => ({ ...f, posNo: o.posNo, branchNo: o.branchNo || f.branchNo || '001' }))}
                    className={`rounded-full px-3 py-1 text-[12px] font-bold ring-1 ring-inset transition ${
                      eForm.posNo === o.posNo
                        ? 'bg-teal-500 text-white ring-teal-500'
                        : 'bg-white text-slate-700 ring-slate-300 hover:ring-teal-400'
                    }`}
                  >
                    {o.posNo}
                    {o.branchNo && <span className="ml-1 font-normal opacity-70">· салбар {o.branchNo}</span>}
                  </button>
                ))}
              </div>
            )}
            {sync.options.length > 1 && (
              <p className="mt-2 text-[12px] opacity-80">
                Баримт бүрд зөвхөн НЭГ POS дугаар дамжина. Сонгосны дараа «Хадгалах» дарна уу.
              </p>
            )}
          </div>
        )}

        <TestNote result={tests.EBARIMT ?? null} />
        <CardActions
          enabled={data.ebarimt.enabled}
          busy={busy === 'EBARIMT'}
          testing={testing === 'EBARIMT'}
          onTest={() => runTest('EBARIMT')}
          onSave={(enabled) =>
            save(
              'EBARIMT',
              {
                enabled,
                merchantTin: eForm.merchantTin.trim() || undefined,
                posNo: eForm.posNo.trim() || undefined,
                branchNo: eForm.branchNo.trim() || undefined,
                districtCode: eForm.districtCode.trim() || undefined,
              },
              () => undefined,
            )
          }
        />
        <p className="mt-3 text-[12px] leading-snug text-slate-500">
          ТТД нь байгууллагын регистрийн дугаараар автоматаар бөглөгддөг. POS дугаарыг тухайн байгууллага ТЕГ-т өөрийн
          нэр дээр бүртгүүлэхэд олгоно — өөр байгууллагын POS дугаарыг ашиглаж болохгүй тул зөвхөн энэ ТТД-д
          харьяалагдах дугаарууд санал болгогдоно. Салбарын дугаар ихэвчлэн 001 (төв салбар). Унтраахад төлбөр
          төлөгдөхөд баримт хэвлэгдэхгүй.
        </p>
      </div>

      {/* QPay */}
      <div className="card p-6">
        <CardHead
          badge="Q"
          badgeClass="bg-navy-900"
          title="QPay Merchant V2"
          subtitle={`Төлбөрийн QR, банкны апп · ${SOURCE_MN[data.qpay.source]}`}
          view={data.qpay}
        />

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Username (client_id)</label>
            <input className="input" value={qForm.username} onChange={(e) => setQForm((f) => ({ ...f, username: e.target.value }))} placeholder="LAWTUS_MN" />
          </div>
          <div>
            <label className="label">Password {data.qpay.passwordMask && <span className="text-slate-500">({data.qpay.passwordMask})</span>}</label>
            <input
              type="password"
              className="input"
              value={qForm.password}
              onChange={(e) => setQForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Солих бол шинээр бичнэ"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label">Invoice code</label>
            <input
              className="input"
              value={qForm.invoiceCode}
              onChange={(e) => setQForm((f) => ({ ...f, invoiceCode: e.target.value }))}
              placeholder="LAWTUS_MN_INVOICE"
            />
          </div>
        </div>

        <TestNote result={tests.QPAY ?? null} />
        <CardActions
          enabled={data.qpay.enabled}
          busy={busy === 'QPAY'}
          testing={testing === 'QPAY'}
          onTest={() => runTest('QPAY')}
          onSave={(enabled) =>
            save(
              'QPAY',
              {
                enabled,
                username: qForm.username.trim() || undefined,
                password: qForm.password || undefined,
                invoiceCode: qForm.invoiceCode.trim() || undefined,
              },
              () => setQForm((f) => ({ ...f, password: '' })),
            )
          }
        />
        <p className="mt-3 text-[12px] leading-snug text-slate-500">
          QPay идэвхтэй үед төлбөрийн гарцаас урьтаж ажиллана. Хоёулаа унтраасан бол төлбөр туршилтын (mock) горимд
          шилжинэ — бодит мөнгө хөдлөхгүй.
        </p>
      </div>

      {/* CallPro */}
      <div className="card p-6">
        <CardHead
          badge="C"
          badgeClass="bg-teal-500"
          title="CallPro Text API"
          subtitle={`SMS илгээлт · ${SOURCE_MN[data.callpro.source]}`}
          view={data.callpro}
        />

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">API key {data.callpro.apiKeyMask && <span className="text-slate-500">({data.callpro.apiKeyMask})</span>}</label>
            <input
              type="password"
              className="input"
              value={cForm.apiKey}
              onChange={(e) => setCForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="Солих бол шинээр бичнэ"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label">Илгээгч дугаар (from)</label>
            <input className="input" value={cForm.from} onChange={(e) => setCForm((f) => ({ ...f, from: e.target.value }))} placeholder="72225700" />
          </div>
        </div>

        <TestNote result={tests.CALLPRO ?? null} />
        <CardActions
          enabled={data.callpro.enabled}
          busy={busy === 'CALLPRO'}
          testing={testing === 'CALLPRO'}
          onTest={() => runTest('CALLPRO')}
          onSave={(enabled) =>
            save(
              'CALLPRO',
              { enabled, apiKey: cForm.apiKey || undefined, from: cForm.from.trim() || undefined },
              () => setCForm((f) => ({ ...f, apiKey: '' })),
            )
          }
        />
        <p className="mt-3 text-[12px] leading-snug text-slate-500">
          Унтраахад SMS mock горимд бичигдэнэ (бодит илгээлт хийгдэхгүй). Мессежийн бүтцийг Тохиргоо → Мессежийн загвар
          хэсгээс өөрчилнө. Мессеж дэх линкийн домэйныг оператор урьдчилан баталгаажуулсан байх шаардлагатай.
        </p>
      </div>
    </div>
  );
}
