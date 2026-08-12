'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminGate, AdminHeader } from '@/components/admin';
import { ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

interface Health {
  qpay: { failed24h: number; succeeded24h: number };
  bonum: { succeeded24h: number; pending24h: number; tenantsWithTerminal: number };
  callpro: { failed24h: number; total24h: number };
  ebarimt: { stuck: number };
  tenants: number;
}

interface TestResult { ok: boolean; httpStatus: number | null; message_mn: string }

function HealthCard({
  title, sub, ok, stats, action,
}: {
  title: string; sub: string; ok: boolean; stats: { label: string; value: string | number; bad?: boolean }[]; action?: React.ReactNode;
}) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-900">{title}</h2>
          <p className="text-[12.5px] text-slate-500">{sub}</p>
        </div>
        <span className="relative flex h-3 w-3">
          {ok && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${ok ? 'bg-emerald-500 shadow-glow-emerald' : 'bg-red-500 shadow-glow-red'}`} />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/80 bg-white/50 px-4 py-3">
            <p className="text-[12px] font-semibold text-slate-500">{s.label}</p>
            <p className={`mt-0.5 text-xl font-extrabold ${s.bad ? 'text-red-600' : 'text-slate-900'}`}>{s.value}</p>
          </div>
        ))}
      </div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default function AdminProvidersPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult | 'loading'>>({});

  useEffect(() => {
    api<Health>('/admin/providers/health').then(setHealth).catch((e) => setError(e.message));
  }, []);

  async function test(code: 'QPAY' | 'CALLPRO' | 'BONUM' | 'EBARIMT') {
    setTests((t) => ({ ...t, [code]: 'loading' }));
    try {
      const r = await api<TestResult>(`/integrations/${code}/test`, { method: 'POST' });
      setTests((t) => ({ ...t, [code]: r }));
    } catch (e: any) {
      setTests((t) => ({ ...t, [code]: { ok: false, httpStatus: null, message_mn: e.message } }));
    }
  }

  const testView = (code: string) => {
    const t = tests[code];
    if (!t) return null;
    if (t === 'loading') return <Spinner className="h-4 w-4" />;
    return <p className={`text-[13px] font-semibold ${t.ok ? 'text-emerald-600' : 'text-red-600'}`}>{t.ok ? '✅' : '❌'} {t.message_mn}</p>;
  };

  return (
    <AdminGate title="Provider health">
      <div className="space-y-5">
        <AdminHeader
          title="💓 Provider health"
          sub="Сүүлийн 24 цагийн provider үзүүлэлт + шууд холболтын тест (A-14)"
          action={<Link href="/admin/integrations" className="btn-secondary">🔌 Credential тохиргоо →</Link>}
        />
        {error && <ErrorNote message={error} />}
        {!health ? (
          <PageLoader />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
            <HealthCard
              title="QPay Merchant V2"
              sub="Төлбөрийн QR / callback / payment-check"
              ok={health.qpay.failed24h === 0}
              stats={[
                { label: 'Амжилттай (24ц)', value: health.qpay.succeeded24h },
                { label: 'Intent алдаа (24ц)', value: health.qpay.failed24h, bad: health.qpay.failed24h > 0 },
              ]}
              action={<div className="flex items-center gap-3"><button className="btn-secondary px-3 py-1.5 text-[13px]" onClick={() => test('QPAY')}>Тест</button>{testView('QPAY')}</div>}
            />
            <HealthCard
              title="Bonum Gateway"
              sub="Төлбөрийн линк / картын гарц"
              ok
              stats={[
                { label: 'Амжилттай (24ц)', value: health.bonum?.succeeded24h ?? 0 },
                { label: 'Хүлээгдэж буй (24ц)', value: health.bonum?.pending24h ?? 0 },
                { label: 'Терминалтай байгууллага', value: health.bonum?.tenantsWithTerminal ?? 0 },
              ]}
              action={<div className="flex items-center gap-3"><button className="btn-secondary px-3 py-1.5 text-[13px]" onClick={() => test('BONUM')}>Тест</button>{testView('BONUM')}</div>}
            />
            <HealthCard
              title="CallPro SMS"
              sub="Төлбөрийн линкийн SMS хүргэлт"
              ok={health.callpro.failed24h === 0}
              stats={[
                { label: 'Илгээсэн (24ц)', value: health.callpro.total24h },
                { label: 'Алдаа (24ц)', value: health.callpro.failed24h, bad: health.callpro.failed24h > 0 },
              ]}
              action={<div className="flex items-center gap-3"><button className="btn-secondary px-3 py-1.5 text-[13px]" onClick={() => test('CALLPRO')}>Тест</button>{testView('CALLPRO')}</div>}
            />
            <HealthCard
              title="eBarimt"
              sub="Татварын баримт үүсгэлт (POS API / LIME)"
              ok={health.ebarimt.stuck === 0}
              stats={[
                { label: 'Гацсан баримт', value: health.ebarimt.stuck, bad: health.ebarimt.stuck > 0 },
                { label: 'Байгууллага', value: health.tenants },
              ]}
              action={<div className="flex items-center gap-3"><button className="btn-secondary px-3 py-1.5 text-[13px]" onClick={() => test('EBARIMT')}>Тест</button>{testView('EBARIMT')}<Link href="/admin/ops" className="btn-secondary px-3 py-1.5 text-[13px]">Ops →</Link></div>}
            />
          </div>
        )}
      </div>
    </AdminGate>
  );
}
