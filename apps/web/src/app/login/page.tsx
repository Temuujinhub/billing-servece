'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Logo } from '@/components/logo';
import { ErrorNote, Spinner } from '@/components/ui';
import { ApiError, login, verifyTwoFactor } from '@/lib/api';
import type { AuthResponse } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Админ SMS 2FA (SCA): сервер twoFactorRequired буцаавал кодын алхам гарна.
  const [twoFactor, setTwoFactor] = useState<string | null>(null);
  const [code, setCode] = useState('');

  function enter(auth: AuthResponse) {
    // Түр/анхдагч нууц үгтэй данс — эхлээд нууц үгээ солиулна.
    if (auth.user.mustChangePassword) {
      router.replace('/settings?changePassword=1');
      return;
    }
    router.replace(auth.user.isAdmin ? '/admin' : '/dashboard');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const auth = await login(email, password);
      if ('twoFactorRequired' in auth) {
        setTwoFactor(auth.message);
        setBusy(false);
        return;
      }
      enter(auth);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Сүлжээний алдаа. Дахин оролдоно уу.');
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      enter(await verifyTwoFactor(email, code));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Сүлжээний алдаа. Дахин оролдоно уу.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col">
      <div className="mx-auto flex w-full max-w-content items-center px-5 py-5">
        <Logo />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="card w-full max-w-md animate-fade-up p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {twoFactor ? 'Баталгаажуулалт' : 'Нэвтрэх'}
          </h1>

          {twoFactor ? (
            <form onSubmit={onVerify} className="mt-6 space-y-4" noValidate>
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">{twoFactor}</p>
              <div>
                <label className="label" htmlFor="code">SMS-ээр ирсэн 6 оронтой код</label>
                <input
                  id="code"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  autoFocus
                  className="input tracking-[0.4em] text-center font-mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                />
              </div>
              {error && <ErrorNote message={error} />}
              <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full py-3">
                {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Баталгаажуулах'}
              </button>
              <button
                type="button"
                className="w-full text-center text-sm text-slate-500 hover:text-indigo-600"
                onClick={() => { setTwoFactor(null); setCode(''); setError(null); }}
              >
                ← Буцах
              </button>
            </form>
          ) : (
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
          )}

          <p className="mt-4 text-center text-sm">
            <Link href="/forgot-password" className="font-medium text-slate-500 hover:text-indigo-600">
              Нууц үгээ мартсан уу?
            </Link>
          </p>
          <p className="mt-3 text-center text-sm text-slate-500">
            Бүртгэлгүй юу?{' '}
            <Link href="/register" className="font-semibold text-indigo-600 hover:text-indigo-700">
              Үнэгүй бүртгүүлэх
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
