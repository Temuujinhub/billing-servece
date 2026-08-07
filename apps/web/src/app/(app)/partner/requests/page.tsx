'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError, getSessionUser } from '@/lib/api';
import { shortDate } from '@/lib/format';
import type { IntegrationRequest } from '@/lib/types';

/**
 * Хамтрагч байгууллагын (Bonum / LIME) ажилтнуудад зориулсан хуудас.
 * Зөвхөн өөрт нь хамаарах мерчант бүртгэлийн хүсэлтүүд харагдана; бүртгэлээ
 * хийж дуусмагц хариугаа (терминал/POS-ийн утгууд) энд бөглөж баталгаажуулна —
 * ингэснээр тухайн байгууллагын үйлчилгээ манай талд шууд идэвхжинэ.
 */

const STATUS_MN: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'Шинэ хүсэлт', cls: 'bg-amber-50 text-amber-700' },
  EMAIL_SENT: { label: 'Шинэ хүсэлт', cls: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Бүртгэгдсэн ✓', cls: 'bg-teal-50 text-teal-700' },
  REJECTED: { label: 'Татгалзсан', cls: 'bg-red-50 text-red-600' },
};

const PAYLOAD_MN: Record<string, string> = {
  name: 'Байгууллагын нэр',
  regNo: 'Регистр',
  address: 'Хаяг',
  contactPhone: 'Утас',
  contactEmail: 'Имэйл',
  bankName: 'Банк',
  bankAccountNo: 'Дансны дугаар',
  bankAccountName: 'Данс эзэмшигч',
  ebarimtMerchantTin: 'Merchant TIN',
};

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

export default function PartnerRequestsPage() {
  const me = getSessionUser();
  const kind = me?.partnerKind ?? null;
  const allowed = Boolean(kind || me?.isAdmin);
  const [items, setItems] = useState<IntegrationRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [resp, setResp] = useState<ResponseForm>(EMPTY_RESPONSE);

  const setR = (key: keyof ResponseForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setResp((v) => ({ ...v, [key]: e.target.value }));

  const load = useCallback(() => {
    api<{ items: IntegrationRequest[] }>('/partner/requests')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Ачаалж чадсангүй'));
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  async function decide(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await api(`/partner/requests/${id}/decision`, { method: 'POST', body: JSON.stringify(body) });
      setOpenId(null);
      setResp(EMPTY_RESPONSE);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Үйлдэл амжилтгүй');
    } finally {
      setBusyId(null);
    }
  }

  if (!allowed) {
    return (
      <div className="card max-w-lg p-8 text-center">
        <p className="text-3xl">🔒</p>
        <h1 className="mt-3 text-lg font-bold text-navy-900">Хамтрагчийн хэсэг</h1>
        <p className="mt-2 text-sm text-muted">Энэ хуудас хамтрагч байгууллагын (төлбөр/eBarimt) ажилтанд зориулагдсан.</p>
      </div>
    );
  }
  if (error && !items) return <ErrorNote message={error} />;
  if (!items) return <PageLoader />;

  const isBonum = (r: IntegrationRequest) => r.kind === 'BONUM';

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Мерчант бүртгэлийн хүсэлтүүд</h1>
        <p className="mt-1 text-sm text-muted">
          billingservice.mn-ээс ирсэн шинэ мерчантуудын бүртгэлийн хүсэлтүүд. Бүртгэлээ хийгээд олгосон
          утгуудаа бөглөж баталгаажуулахад тухайн байгууллагын үйлчилгээ шууд идэвхжинэ.
        </p>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-navy-50/60">
            <tr>
              <th className="th">Байгууллага</th>
              <th className="th">Холбоо барих</th>
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
                  <tr className="cursor-pointer hover:bg-navy-50/40" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                    <td className="td">
                      <p className="font-medium">{r.tenant?.name ?? r.payload.name}</p>
                      <p className="text-[12px] text-muted">Регистр: {r.payload.regNo ?? r.tenant?.regNo ?? '—'}</p>
                    </td>
                    <td className="td text-[13px] text-muted">
                      <p>{r.payload.contactPhone}</p>
                      <p>{r.payload.contactEmail}</p>
                    </td>
                    <td className="td">
                      <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="td text-muted">{shortDate(r.createdAt)}</td>
                    <td className="td">{open ? <span className="text-[13px] font-semibold text-indigo-600">Нээж бүртгэх →</span> : null}</td>
                  </tr>
                  {openId === r.id && (
                    <tr>
                      <td className="td bg-navy-50/30" colSpan={5}>
                        <div className="grid gap-x-8 gap-y-1 py-2 text-[13px] sm:grid-cols-2">
                          {Object.entries(r.payload)
                            .filter(([k, v]) => k !== 'kind' && v)
                            .map(([k, v]) => (
                              <p key={k}>
                                <span className="text-muted">{PAYLOAD_MN[k] ?? k}:</span> <b className="text-navy-800">{String(v)}</b>
                              </p>
                            ))}
                        </div>

                        {open && (
                          <div className="mt-2 rounded-xl border border-teal-200 bg-teal-50/50 p-4">
                            <p className="text-[13px] font-bold text-teal-800">
                              {isBonum(r) ? 'Бүртгэлийн хариу — терминалын мэдээлэл' : 'Бүртгэлийн хариу — POS бүртгэлийн мэдээлэл'}
                            </p>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              {isBonum(r) ? (
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
                              <button
                                className="rounded-lg bg-red-50 px-3 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-100"
                                disabled={busyId === r.id}
                                onClick={() => {
                                  const note = window.prompt('Татгалзсан шалтгаан (мерчантад харагдана):') ?? undefined;
                                  void decide(r.id, { approved: false, note });
                                }}
                              >
                                ✕ Татгалзах
                              </button>
                              <button
                                className="rounded-lg bg-teal-600 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                                disabled={
                                  busyId === r.id ||
                                  (isBonum(r)
                                    ? !resp.terminalId.trim() || !resp.appSecret.trim() || !resp.checksumKey.trim()
                                    : !resp.merchantTin.trim() || !resp.posNo.trim())
                                }
                                onClick={() =>
                                  decide(r.id, {
                                    approved: true,
                                    ...(isBonum(r)
                                      ? { terminalId: resp.terminalId.trim(), appSecret: resp.appSecret.trim(), checksumKey: resp.checksumKey.trim() }
                                      : {
                                          merchantTin: resp.merchantTin.trim(),
                                          posNo: resp.posNo.trim(),
                                          branchNo: resp.branchNo.trim() || undefined,
                                          districtCode: resp.districtCode.trim() || undefined,
                                        }),
                                  })
                                }
                              >
                                {busyId === r.id ? <Spinner className="h-4 w-4 text-white" /> : '✓ Бүртгэлийг баталгаажуулах'}
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
