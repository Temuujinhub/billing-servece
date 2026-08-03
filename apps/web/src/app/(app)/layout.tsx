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
  { href: '/billing', label: 'Billing & Modules', icon: '⚙️' },
  { href: '/settings', label: 'Тохиргоо', icon: '🛠' },
];

// Visible ONLY to platform admins (user.isAdmin) — merchants never see these.
const ADMIN_NAV = [
  { href: '/admin', label: 'Админ самбар', icon: '🛡️' },
  { href: '/admin/integrations', label: 'Интеграци', icon: '🔌' },
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
    return <div className="flex min-h-screen items-center justify-center bg-surface" />;
  }

  return (
    <div className="min-h-screen">
      {/* Glass top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/40 bg-white/60 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <button
            className="rounded-lg p-1.5 text-slate-600 hover:bg-white/70 lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Цэс нээх"
          >
            ☰
          </button>
          <Logo href="/dashboard" />
          {/* Live API status with pulse */}
          <span className="ml-2 hidden items-center gap-2 rounded-full border border-white/80 bg-white/50 px-3 py-1 text-[12px] font-semibold text-slate-600 backdrop-blur-md md:inline-flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-glow-emerald" />
            </span>
            API идэвхтэй
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-white/80 bg-white/50 px-3 py-1 text-[12px] font-semibold text-indigo-700 backdrop-blur-md sm:inline">
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
          className={`fixed inset-y-0 top-16 z-30 w-60 shrink-0 border-r border-white/40 bg-white/60 backdrop-blur-xl transition-transform lg:static lg:translate-x-0 ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3" aria-label="Самбарын цэс">
            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Merchant</p>
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-all duration-300 ${
                    active
                      ? 'border border-white/80 bg-white/80 text-indigo-700 shadow-[0_4px_16px_-6px_rgba(79,70,229,0.25)] backdrop-blur-md'
                      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
            {user.isAdmin && (
              <>
                <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-500">Admin</p>
                {ADMIN_NAV.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-all duration-300 ${
                        active
                          ? 'border border-white/80 bg-white/80 text-amber-700 shadow-[0_4px_16px_-6px_rgba(245,158,11,0.3)] backdrop-blur-md'
                          : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
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
            <div className="mt-auto rounded-2xl border border-white/70 bg-gradient-to-br from-indigo-600/90 to-blue-500/90 p-4 text-[12.5px] leading-snug text-white shadow-[0_10px_30px_-12px_rgba(79,70,229,0.5)]">
              <p className="font-bold">billingservice.mn</p>
              <p className="mt-1 text-indigo-100">MVP v0.1 · Нэхэмжлэхээс eBarimt хүртэл нэг урсгалаар.</p>
            </div>
          </nav>
        </aside>
        {menuOpen && <div className="fixed inset-0 z-20 bg-slate-900/25 backdrop-blur-[2px] lg:hidden" onClick={() => setMenuOpen(false)} />}

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
