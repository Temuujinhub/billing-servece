'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { getSessionUser, logout } from '@/lib/api';
import type { SessionUser } from '@/lib/types';

const NAV = [
  { href: '/dashboard', label: 'Хянах самбар', icon: '📊' },
  { href: '/invoices', label: 'Нэхэмжлэх', icon: '🧾' },
  { href: '/imports', label: 'Excel импорт', icon: '📥' },
  { href: '/customers', label: 'Харилцагч', icon: '👥' },
  { href: '/payments', label: 'Төлбөр', icon: '💳' },
  { href: '/receipts', label: 'eBarimt', icon: '🧿' },
  { href: '/reports', label: 'Тайлан', icon: '📈' },
  { href: '/billing', label: 'Billing & Modules', icon: '⚙️' },
  { href: '/developers', label: 'API & Webhooks', icon: '🧩' },
  { href: '/settings', label: 'Тохиргоо', icon: '🛠' },
];

// Visible ONLY to platform admins (user.isAdmin) — merchants never see these.
const ADMIN_NAV = [
  { href: '/admin', label: 'Админ самбар', icon: '🛡️' },
  { href: '/admin/merchants', label: 'Байгууллага / KYB', icon: '🏢' },
  { href: '/admin/requests', label: 'Бүртгэлийн хүсэлт', icon: '📮' },
  { href: '/admin/transactions', label: 'Гүйлгээ', icon: '🧮' },
  { href: '/admin/ops', label: 'Ops дараалал', icon: '🚦' },
  { href: '/admin/reconciliation', label: 'Тулгалт', icon: '⚖️' },
  { href: '/admin/health', label: 'System health', icon: '🩺' },
  { href: '/admin/providers', label: 'Provider health', icon: '💓' },
  { href: '/admin/integrations', label: 'Интеграци', icon: '🔌' },
  { href: '/admin/pricing', label: 'Үнэ & Flags', icon: '🏷️' },
  { href: '/admin/incidents', label: 'Incident', icon: '🚨' },
  { href: '/admin/support', label: 'Хайлт', icon: '🔎' },
  { href: '/admin/audit', label: 'Audit', icon: '📜' },
  { href: '/admin/access', label: 'Админ эрх', icon: '🔐' },
];

const ROLE_MN: Record<string, string> = {
  OWNER: 'Эзэмшигч',
  OPERATOR: 'Оператор',
  ACCOUNTANT: 'Нягтлан',
  VIEWER: 'Үзэгч',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const u = getSessionUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setUser(u);
  }, [router]);

  if (!user) {
    return <div className="app-dark flex min-h-screen items-center justify-center" />;
  }

  return (
    <div className="app-dark min-h-screen">
      {/* Glass top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-[#0a1120]/85 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <button
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Цэс нээх"
          >
            ☰
          </button>
          <Logo dark href={user.isAdmin ? '/admin' : '/dashboard'} />
          {/* Live API status with pulse */}
          <span className="ml-2 hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-emerald-300 md:inline-flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-glow-emerald" />
            </span>
            API идэвхтэй
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-teal-400/25 bg-teal-500/10 px-3 py-1 text-[12px] font-semibold text-teal-300 sm:inline">
            {ROLE_MN[user.role] ?? user.role}
          </span>
          <span className="hidden text-sm font-semibold text-slate-800 sm:inline">{user.name}</span>
          <button
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
            className="btn-secondary px-3 py-1.5 text-[13px]"
          >
            Гарах
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 top-16 z-30 w-60 shrink-0 border-r border-white/10 bg-[#0a1120]/90 backdrop-blur-xl transition-transform lg:static lg:translate-x-0 ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3" aria-label="Самбарын цэс">
            {/* Хамтрагчийн ажилтан зөвхөн өөрийн хүсэлтүүдийн хуудсыг харна */}
            {user.partnerKind && (
              <>
                <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-400">Хамтрагч</p>
                <Link
                  href="/partner/requests"
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-all duration-300 ${
                    pathname.startsWith('/partner')
                      ? 'border border-teal-400/25 bg-teal-500/10 text-teal-300 shadow-[0_4px_16px_-6px_rgba(20,184,166,0.35)]'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                  }`}
                  aria-current={pathname.startsWith('/partner') ? 'page' : undefined}
                >
                  <span aria-hidden="true">📮</span>
                  Бүртгэлийн хүсэлтүүд
                </Link>
              </>
            )}
            {!user.isAdmin && !user.partnerKind && (
            <>
            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Merchant</p>
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-all duration-300 ${
                    active
                      ? 'border border-teal-400/25 bg-teal-500/10 text-teal-300 shadow-[0_4px_16px_-6px_rgba(20,184,166,0.35)]'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
            </>
            )}
            {user.isAdmin && (
              <>
                <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-500">Admin</p>
                {ADMIN_NAV.map((item) => {
                  const active = item.href === '/admin' ? pathname === '/admin' : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-all duration-300 ${
                        active
                          ? 'border border-amber-400/25 bg-amber-500/10 text-amber-300 shadow-[0_4px_16px_-6px_rgba(245,158,11,0.3)]'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                      }`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span aria-hidden="true">{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </>
            )}
            <div className="mt-auto rounded-2xl border border-teal-400/20 bg-gradient-to-br from-teal-600/25 to-emerald-600/15 p-4 text-[12.5px] leading-snug text-white shadow-[0_10px_30px_-12px_rgba(20,184,166,0.3)]">
              <p className="font-bold">msgbill.mn</p>
              <p className="mt-1 text-teal-100/80">Нэхэмжлэхээс eBarimt хүртэл нэг урсгалаар.</p>
            </div>
          </nav>
        </aside>
        {menuOpen && <div className="fixed inset-0 z-20 bg-black/50 backdrop-blur-[2px] lg:hidden" onClick={() => setMenuOpen(false)} />}

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 py-7 sm:px-6 lg:px-8">
          {user?.mustChangePassword && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-800">
              <span>⚠ Та түр (анхдагч) нууц үгээр нэвтэрсэн байна. Аюулгүй байдлын үүднээс нууц үгээ солино уу.</span>
              <Link href="/settings?changePassword=1" className="btn-primary px-3 py-1.5 text-[12.5px]">
                Нууц үг солих →
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
