'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';
import { shortDate } from '@/lib/format';
import type { IntegrationRequest } from '@/lib/types';

/**
 * Платформын админ: бүх байгууллагын Bonum/eBarimt бүртгэлийн хүсэлтүүд.
 * Bonum/LIME талд автомат бүртгэл байхгүй тул эндээс имэйл дахин илгээх,
 * хариу ирсний дараа баталгаажуулах/татгалзах шийдвэрийг гаргана.
 */

const STATUS_MN: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'Имэйл илгээгдээгүй', cls: 'bg-amber-50 text-amber-700' },
  EMAIL_SENT: { label: 'Илгээгдсэн', cls: 'bg-navy-50 text-navy-700' },
  APPROVED: { label: 'Баталгаажсан', cls: 'bg-teal-50 text-teal-700' },
  REJECTED: { label: 'Татгалзсан', cls: 'bg-red-50 text-red-600' },
};

const KIND_MN: Record<string, string> = {
  BONUM: 'Bonum төлбөр',
  EBARIMT: 'eBarimt (LIME)',
};

/** Партнёраас ирсэн хариуны талбарууд (approve үед tenant-д бичигдэнэ). */
interface ResponseForm {
  terminalId: string;
  appSecret: string;
  checksumKey: string;
  merchantTin: string;
  posNo: string;
  branchNo: string;
  districtCode: string;
}

const EMPTY_RESPONSE: ResponseForm = {
  terminalId: '',
  appSecret: '',
  checksumKey: '',
  merchantTin: '',
  posNo: '',
  branchNo: '',
  districtCode: '',
};

export default function AdminRequestsPage() {
  const [items, setItems] = useState<IntegrationRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [resp, setResp] = useState<ResponseForm>(EMPTY_RESPONSE);
  const isAdmin = getSessionUser()?.isAdmin === true;

  const setR = (key: keyof ResponseForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setResp((v) => ({ ...v, [key]: e.target.value }));

  const load = useCallback(() => {
    api<{ items: IntegrationRequest[] }>('/admin/integration-requests')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ачаалж чадсангүй'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, path: string, body?: unknown) {
    setBusyId(id);
    setError(null);
    try {
      await api(`/admin/integration-requests/${id}${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Үйлдэл амжилтгүй');
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="card max-w-lg p-8 text-center">
        <p className="text-3xl">🔒</p>
        <h1 className="mt-3 text-lg font-bold text-navy-900">Зөвхөн платформын админ</h1>
        <p className="mt-2 text-sm text-muted">Энэ хуудас интеграцийн бүртгэлийн хүсэлтүүдийг хянах платформын ажилтанд зориулагдсан.</p>
      </div>
    );
  }
  if (error && !items) return <ErrorNote message={error} />;
  if (!items) return <PageLoader />;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Бүртгэлийн хүсэлтүүд</h1>
        <p className="mt-1 text-sm text-muted">
          Bonum / LIME рүү илгээсэн мерчант бүртгэлийн хүсэлтүүд. Хариу ирмэгц баталгаажуулна — eBarimt
          баталгаажилт нь тухайн байгууллагын EBARIMT модулийг автоматаар идэвхжүүлнэ.
        </p>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-navy-50/60">
            <tr>
              <th className="th">Байгууллага</th>
              <th className="th">Төрөл</th>
              <th className="th">Төлөв</th>
              <th className="th">Огноо</th>
              <th className="th">Үйлдэл</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.length === 0 && (
              <tr>
                <td className="td py-8 text-center text-muted" colSpan={5}>
                  Хүсэлт алга
                </td>
              </tr>
            )}
            {items.map((r) => {
              const st = STATUS_MN[r.status] ?? { label: r.status, cls: 'bg-navy-50 text-navy-700' };
              const open = !['APPROVED', 'REJECTED'].includes(r.status);
              return (
                <Fragment key={r.id}>
                  <tr className="cursor-pointer hover:bg-navy-50/40" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td className="td">
                      <p className="font-medium">{r.tenant?.name ?? r.payload.name}</p>
                      <p className="text-[12px] text-muted">{r.tenant?.contactEmail}</p>
                    </td>
                    <td className="td">{KIND_MN[r.kind] ?? r.kind}</td>
                    <td className="td">
                      <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${st.cls}`}>{st.label}</span>
                      {r.error && <p className="mt-1 max-w-[220px] truncate text-[11.5px] text-red-500">{r.error}</p>}
                    </td>
                    <td className="td text-muted">{shortDate(r.createdAt)}</td>
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      {open && (
                        <div className="flex flex-wrap gap-2">
                          <button className="btn-secondary px-3 py-1.5 text-[12.5px]" disabled={busyId === r.id} onClick={() => act(r.id, '/resend-email')}>
                            {busyId === r.id ? <Spinner className="h-4 w-4" /> : '✉ Имэйл дахин илгээх'}
                          </button>
                          <button
                            className="rounded-lg bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700"
                            disabled={busyId === r.id}
                            onClick={() => {
                              setResp(EMPTY_RESPONSE);
                              setApproveId(approveId === r.id ? null : r.id);
                              setExpanded(r.id);
                            }}
                          >
                            ✓ Баталгаажуулах…
                          </button>
                          <button
                            className="rounded-lg bg-red-50 px-3 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-100"
                            disabled={busyId === r.id}
                            onClick={() => {
                              const note = window.prompt('Татгалзсан шалтгаан:') ?? undefined;
                              void act(r.id, '/decision', { approved: false, note });
                            }}
                          >
                            ✕ Татгалзах
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr>
                      <td className="td bg-navy-50/30" colSpan={5}>
                        <div className="grid gap-x-8 gap-y-1 py-2 text-[13px] sm:grid-cols-2">
                          {Object.entries(r.payload)
                            .filter(([k, v]) => k !== 'kind' && v)
                            .map(([k, v]) => (
                              <p key={k}>
                                <span className="text-muted">{k}:</span> <b className="text-navy-800">{String(v)}</b>
                              </p>
                            ))}
                          {r.note && (
                            <p className="sm:col-span-2">
                              <span className="text-muted">Тэмдэглэл:</span> {r.note}
                            </p>
                          )}
                        </div>

                        {/* Партнёрын ХАРИУГ бөглөж баталгаажуулах цонх: энд оруулсан
                            утгууд tenant-ийн бүртгэлд шууд бичигдэж үйлчилгээ асна.
                            Ирээдүйд партнёр API гарвал энэ маягт автоматаар бөглөгдөнө. */}
                        {approveId === r.id && (
                          <div className="mt-2 rounded-xl border border-teal-200 bg-teal-50/50 p-4">
                            <p className="text-[13px] font-bold text-teal-800">
                              {r.kind === 'BONUM' ? 'Bonum-оос ирсэн хариу (терминалын мэдээлэл)' : 'LIME/ТЕГ-ээс ирсэн хариу (POS бүртгэл)'}
                            </p>
                            <p className="mt-0.5 text-[12px] text-teal-700">
                              Имэйлээр ирсэн утгуудыг бөглөөд баталгаажуулбал тухайн байгууллагын үйлчилгээ идэвхжинэ.
                              {r.kind === 'BONUM' && ' Нууц түлхүүрүүд шифрлэгдэж хадгалагдана.'}
                            </p>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              {r.kind === 'BONUM' ? (
                                <>
                                  <div>
                                    <label className="label">Terminal ID</label>
                                    <input className="input" value={resp.terminalId} onChange={setR('terminalId')} maxLength={30} />
                                  </div>
                                  <div>
                                    <label className="label">Secret Key</label>
                                    <input className="input" type="password" value={resp.appSecret} onChange={setR('appSecret')} autoComplete="new-password" />
                                  </div>
                                  <div>
                                    <label className="label">Checksum Key</label>
                                    <input className="input" type="password" value={resp.checksumKey} onChange={setR('checksumKey')} autoComplete="new-password" />
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>
                                    <label className="label">Merchant TIN</label>
                                    <input className="input" value={resp.merchantTin} onChange={setR('merchantTin')} maxLength={20} />
                                  </div>
                                  <div>
                                    <label className="label">POS дугаар (posNo)</label>
                                    <input className="input" value={resp.posNo} onChange={setR('posNo')} maxLength={20} />
                                  </div>
                                  <div>
                                    <label className="label">Салбар (branchNo)</label>
                                    <input className="input" value={resp.branchNo} onChange={setR('branchNo')} maxLength={10} placeholder="001" />
                                  </div>
                                  <div>
                                    <label className="label">Дүүргийн код</label>
                                    <input className="input" value={resp.districtCode} onChange={setR('districtCode')} maxLength={10} placeholder="3505" />
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="mt-3 flex justify-end gap-2">
                              <button className="btn-secondary px-3 py-1.5 text-[12.5px]" onClick={() => setApproveId(null)}>
                                Болих
                              </button>
                              <button
                                className="rounded-lg bg-teal-600 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                                disabled={
                                  busyId === r.id ||
                                  (r.kind === 'BONUM'
                                    ? !resp.terminalId.trim() || !resp.appSecret.trim() || !resp.checksumKey.trim()
                                    : !resp.merchantTin.trim() || !resp.posNo.trim())
                                }
                                onClick={async () => {
                                  await act(r.id, '/decision', {
                                    approved: true,
                                    ...(r.kind === 'BONUM'
                                      ? { terminalId: resp.terminalId.trim(), appSecret: resp.appSecret.trim(), checksumKey: resp.checksumKey.trim() }
                                      : {
                                          merchantTin: resp.merchantTin.trim(),
                                          posNo: resp.posNo.trim(),
                                          branchNo: resp.branchNo.trim() || undefined,
                                          districtCode: resp.districtCode.trim() || undefined,
                                        }),
                                  });
                                  setApproveId(null);
                                  setResp(EMPTY_RESPONSE);
                                }}
                              >
                                {busyId === r.id ? <Spinner className="h-4 w-4 text-white" /> : '✓ Хариуг хадгалж идэвхжүүлэх'}
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
