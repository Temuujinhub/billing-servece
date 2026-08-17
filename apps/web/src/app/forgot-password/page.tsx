'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Logo } from '@/components/logo';
import { PasswordPolicyChecklist, passwordPolicyOk } from '@/components/password-policy';
import { ErrorNote, Spinner } from '@/components/ui';
import { ApiError, apiPublic } from '@/lib/api';

/**
 * Нууц үг сэргээх (B-45): 1) имэйл → бүртгэлтэй утас руу 6 оронтой код SMS-ээр
 * очно; 2) код + шинэ нууц үг → шинэчлээд нэвтрэх хуудас руу.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPublic<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setNotice(res.message);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Сүлжээний алдаа. Дахин оролдоно уу.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!passwordPolicyOk(password)) {
      setError('Нууц үг доорх бүх шаардлагыг хангасан байх ёстой.');
      return;
    }
    if (password !== confirm) {
      setError('Нууц үг давталттайгаа таарахгүй байна.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPublic('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, newPassword: password }),
      });
      router.replace('/login');
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
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Нууц үг сэргээх</h1>

          {step === 1 ? (
            <>
              <p className="mt-1.5 text-sm text-slate-500">
                Бүртгэлтэй имэйлээ оруулна уу — дансны утасны дугаар руу 6 оронтой код SMS-ээр очно.
              </p>
              <form onSubmit={requestCode} className="mt-6 space-y-4" noValidate>
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
                {error && <ErrorNote message={error} />}
                <button type="submit" disabled={busy} className="btn-primary w-full py-3">
                  {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Код авах'}
                </button>
              </form>
            </>
          ) : (
            <>
              {notice && (
                <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">{notice}</p>
              )}
              <form onSubmit={submitReset} className="mt-5 space-y-4" noValidate>
                <div>
                  <label className="label" htmlFor="code">SMS-ээр ирсэн 6 оронтой код</label>
                  <input
                    id="code"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    className="input tracking-[0.4em] text-center font-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="password">Шинэ нууц үг</label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <PasswordPolicyChecklist password={password} />
                </div>
                <div>
                  <label className="label" htmlFor="confirm">Шинэ нууц үг (давтах)</label>
                  <input
                    id="confirm"
                    type="password"
                    required
                    autoComplete="new-password"
                    className="input"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                {error && <ErrorNote message={error} />}
                <button type="submit" disabled={busy} className="btn-primary w-full py-3">
                  {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Нууц үг шинэчлэх'}
                </button>
                <button
                  type="button"
                  className="w-full text-center text-sm text-slate-500 hover:text-indigo-600"
                  onClick={() => { setStep(1); setError(null); }}
                >
                  ← Код дахин авах
                </button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">Нэвтрэх хуудас руу буцах</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
