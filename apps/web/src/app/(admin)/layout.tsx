'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { getSessionUser, logout } from '@/lib/api';
import type { SessionUser } from '@/lib/types';

/**
 * Платформ админы ТУСДАА бүрхүүл. Merchant самбараас зориуд өөр өнгө/бүтэцтэй —
 * админ хийж буй үйлдэл (бүх байгууллагын бүртгэлийн хүсэлт) нь тухайн
 * байгууллагын өдөр тутмын ажилтай ХЭЗЭЭ Ч хольж харагдахгүй.
 */

const ADMIN_NAV = [{ href: '/admin/requests', label: 'Бүртгэлийн хүсэлт', icon: '📮' }];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const u = getSessionUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    if (!u.isPlatformAdmin) {
      // Энгийн хэрэглэгч энд орох ёсгүй — merchant самбар руу нь буцаана.
      router.replace('/dashboard');
      return;
    }
    setUser(u);
  }, [router]);

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center bg-navy-950" />;
  }

  return (
    <div className="min-h-screen bg-navy-950">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/10 bg-navy-950 px-4 text-white">
        <div className="flex items-center gap-3">
          <Logo dark href="/admin/requests" />
          <span className="rounded-full bg-amber-400/15 px-3 py-1 text-[12px] font-bold uppercase tracking-widest text-amber-300">
            Платформ админ
          </span>
        </div>
        <div className="flex items-center gap-4">
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
        <aside className="fixed inset-y-0 top-14 z-30 hidden w-60 shrink-0 border-r border-white/10 bg-navy-950 lg:static lg:block">
          <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3" aria-label="Админ цэс">
            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-navy-400">Платформ</p>
            {ADMIN_NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition ${
                    active ? 'bg-white/10 text-white' : 'text-navy-200 hover:bg-white/5 hover:text-white'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
            <div className="mt-4 border-t border-white/10 pt-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-teal-300 transition hover:bg-white/5"
              >
                <span aria-hidden="true">←</span>
                Merchant самбар руу
              </Link>
            </div>
            <div className="mt-auto rounded-xl bg-white/5 p-4 text-[12.5px] leading-snug text-navy-300">
              <p className="font-bold text-white">Платформын удирдлага</p>
              <p className="mt-1">Энд бүх байгууллагын Bonum / eBarimt (LIME) бүртгэлийн хүсэлтийг хянана.</p>
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 rounded-tl-2xl bg-surface px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
