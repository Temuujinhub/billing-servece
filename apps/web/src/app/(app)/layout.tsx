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
    <div className="min-h-screen bg-surface">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between bg-navy-900 px-4 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <button
            className="rounded-md p-1.5 hover:bg-white/10 lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Цэс нээх"
          >
            ☰
          </button>
          <Logo dark href="/dashboard" />
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium text-navy-100 sm:inline">
            {ROLE_MN[user.role] ?? user.role}
          </span>
          <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
          <button
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-[13px] font-medium hover:bg-white/10"
          >
            Гарах
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 top-14 z-30 w-60 shrink-0 border-r border-line bg-white transition-transform lg:static lg:translate-x-0 ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3" aria-label="Самбарын цэс">
            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-navy-300">Merchant</p>
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition ${
                    active ? 'bg-teal-50 text-teal-700' : 'text-navy-700 hover:bg-navy-50'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
            <div className="mt-auto rounded-xl bg-navy-50 p-4 text-[12.5px] leading-snug text-navy-600">
              <p className="font-bold text-navy-800">billingservice.mn</p>
              <p className="mt-1">MVP v0.1 · Тусламж хэрэгтэй бол Тохиргоо хэсгээс холбоо барих мэдээллээ шинэчлээрэй.</p>
            </div>
          </nav>
        </aside>
        {menuOpen && <div className="fixed inset-0 z-20 bg-navy-950/30 lg:hidden" onClick={() => setMenuOpen(false)} />}

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
