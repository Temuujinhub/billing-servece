'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminGate, AdminHeader } from '@/components/admin';
import { ErrorNote, PageLoader } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';

interface ProbeResult {
  reachable: boolean;
  httpStatus: number | null;
  latencyMs: number;
  sample: string;
}

interface ProviderCheck {
  ok: boolean;
  httpStatus: number | null;
  message_mn: string;
}

interface SystemHealth {
  checkedAt: string;
  db: { ok: boolean; latencyMs: number; tenants: number; users: number; invoices: number };
  queues: { smsQueued: number; smsFailed24h: number; receiptsPending: number; intentsProcessing: number; reminderTenants: number };
  providers: { qpay: ProviderCheck; callpro: ProviderCheck };
  ebarimt: { tinLookup: ProbeResult; infoLookup: ProbeResult };
  admins: { email: string; name: string; createdAt: string }[];
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {ok && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500 shadow-glow-emerald' : 'bg-red-500 shadow-glow-red'}`} />
    </span>
  );
}

function HealthCard({ ok, title, detail, children }: { ok: boolean; title: string; detail?: string; children?: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2.5">
        <StatusDot ok={ok} />
        <h2 className="font-bold text-slate-900">{title}</h2>
        {detail && <span className="ml-auto text-[12.5px] font-semibold text-slate-500">{detail}</span>}
      </div>
      {children && <div className="mt-3 space-y-1.5 text-[13.5px] text-slate-600">{children}</div>}
    </div>
  );
}

export default function AdminHealthPage() {
  const [data, setData] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    api<SystemHealth>('/admin/health/system')
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ebarimtOk = data ? data.ebarimt.tinLookup.reachable && (data.ebarimt.tinLookup.httpStatus ?? 599) < 500 : false;
  const superAdminOk = data ? data.admins.some((a) => a.email === 'stemuujin@gmail.com') : false;
  const queuesOk = data ? data.queues.smsFailed24h === 0 && data.queues.receiptsPending < 20 : false;

  return (
    <AdminGate title="System Health">
      <div className="space-y-6">
        <AdminHeader
          title="System Health"
          sub="Хамаарал бүрийн бодит байдал — DB, QPay, CallPro, eBarimt бүртгэл, дараалал, админ эрх"
          action={
            <button className="btn-primary px-4 py-2 text-[13.5px]" onClick={load} disabled={busy}>
              {busy ? 'Шалгаж байна…' : '↻ Дахин шалгах'}
            </button>
          }
        />
        {error && <ErrorNote message={error} onRetry={load} />}
        {!data ? (
          error ? null : <PageLoader />
        ) : (
          <>
            <p className="text-[13px] text-slate-500">Сүүлд шалгасан: {dateTime(data.checkedAt)}</p>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <HealthCard ok={data.db.ok} title="Database" detail={`${data.db.latencyMs}ms`}>
                <p>Байгууллага: <b>{data.db.tenants}</b> · Хэрэглэгч: <b>{data.db.users}</b> · Нэхэмжлэх: <b>{data.db.invoices}</b></p>
              </HealthCard>

              <HealthCard
                ok={data.providers.qpay.ok}
                title="QPay Merchant API"
                detail={data.providers.qpay.httpStatus ? `HTTP ${data.providers.qpay.httpStatus}` : '—'}
              >
                <p>{data.providers.qpay.message_mn}</p>
              </HealthCard>

              <HealthCard
                ok={data.providers.callpro.ok}
                title="CallPro SMS API"
                detail={data.providers.callpro.httpStatus ? `HTTP ${data.providers.callpro.httpStatus}` : '—'}
              >
                <p>{data.providers.callpro.message_mn}</p>
              </HealthCard>

              <HealthCard
                ok={ebarimtOk}
                title="eBarimt бүртгэл (НӨАТУС)"
                detail={`${data.ebarimt.tinLookup.latencyMs}ms`}
              >
                <p>
                  ТТД lookup: <b>{data.ebarimt.tinLookup.httpStatus ?? 'холбогдоогүй'}</b> · Нэр lookup:{' '}
                  <b>{data.ebarimt.infoLookup.httpStatus ?? 'холбогдоогүй'}</b>
                </p>
                <p className="scroll-thin overflow-x-auto rounded-lg bg-navy-50 px-2.5 py-1.5 font-mono text-[11.5px] text-navy-700">
                  {data.ebarimt.tinLookup.sample || '(хоосон хариу)'}
                </p>
              </HealthCard>

              <HealthCard ok={queuesOk} title="Дараалал / Queue">
                <p>SMS хүлээгдэж буй: <b>{data.queues.smsQueued}</b> · SMS алдаа (24ц): <b className={data.queues.smsFailed24h > 0 ? 'text-red-600' : ''}>{data.queues.smsFailed24h}</b></p>
                <p>eBarimt хүлээгдэж буй: <b>{data.queues.receiptsPending}</b> · Төлбөр processing: <b>{data.queues.intentsProcessing}</b></p>
                <p>Сануулга идэвхжүүлсэн байгууллага: <b>{data.queues.reminderTenants}</b></p>
              </HealthCard>

              <HealthCard ok={superAdminOk} title="Супер админ">
                {data.admins.length === 0 && <p className="text-red-600">⚠ Платформ админ бүртгэлгүй байна!</p>}
                {data.admins.map((a) => (
                  <p key={a.email}>
                    <b>{a.email}</b> — {a.name}
                    {a.email === 'stemuujin@gmail.com' && <span className="ml-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">SUPER</span>}
                  </p>
                ))}
                {!superAdminOk && (
                  <p className="text-amber-700">
                    stemuujin@gmail.com админ олдсонгүй — сервер дээрх .env-д ADMIN_BOOTSTRAP_EMAIL/PASSWORD мөрүүд байгаа эсэхийг шалгаад API-г дахин асаана уу.
                  </p>
                )}
              </HealthCard>
            </div>
          </>
        )}
      </div>
    </AdminGate>
  );
}
