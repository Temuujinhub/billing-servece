'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Logo } from '@/components/logo';
import { ErrorNote, Spinner } from '@/components/ui';
import { ApiError, login } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Сүлжээний алдаа. Дахин оролдоно уу.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface">
      <div className="mx-auto flex w-full max-w-content items-center px-5 py-5">
        <Logo />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="card w-full max-w-md animate-fade-up p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Нэвтрэх</h1>
          <p className="mt-1.5 text-sm text-muted">Демо: demo@billingservice.mn / Demo123$</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="email">Имэйл</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.mn"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Нууц үг</label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && <ErrorNote message={error} />}
            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Нэвтрэх'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Бүртгэлгүй юу?{' '}
            <Link href="/register" className="font-semibold text-teal-600 hover:text-teal-700">
              Үнэгүй бүртгүүлэх
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
