'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Logo } from '@/components/logo';
import { ErrorNote, Spinner } from '@/components/ui';
import { ApiError, registerAccount } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    organizationName: '',
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await registerAccount({
        organizationName: form.organizationName,
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
      });
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
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Байгууллагаа бүртгүүлэх</h1>
          <p className="mt-1.5 text-sm text-muted">Хэдхэн минутад workspace-ээ үүсгээрэй.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="org">Байгууллагын нэр</label>
              <input id="org" required className="input" value={form.organizationName} onChange={(e) => set('organizationName', e.target.value)} placeholder="Жишээ: Ирээдүй Сургууль ХХК" />
            </div>
            <div>
              <label className="label" htmlFor="name">Таны нэр</label>
              <input id="name" required className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Овог Нэр" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="email">Имэйл</label>
                <input id="email" type="email" required autoComplete="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.mn" />
              </div>
              <div>
                <label className="label" htmlFor="phone">Утас <span className="text-muted">(заавал биш)</span></label>
                <input id="phone" className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="88112233" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="password">Нууц үг</label>
              <input id="password" type="password" required minLength={8} autoComplete="new-password" className="input" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Доод тал нь 8 тэмдэгт, үсэг + тоо" />
            </div>
            {error && <ErrorNote message={error} />}
            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? <Spinner className="h-5 w-5 text-white" /> : 'Бүртгүүлэх'}
            </button>
            <p className="text-center text-[12px] leading-snug text-muted">
              Бүртгүүлснээр үйлчилгээний нөхцөл болон нууцлалын бодлогыг зөвшөөрч байна.
            </p>
          </form>

          <p className="mt-4 text-center text-sm text-muted">
            Бүртгэлтэй юу?{' '}
            <Link href="/login" className="font-semibold text-teal-600 hover:text-teal-700">
              Нэвтрэх
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
