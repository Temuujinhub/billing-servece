'use client';

/**
 * Нууц үгийн бодлого — серверийн auth.dto.ts PASSWORD_POLICY_REGEX-ийн толь.
 * Дүрэм өөрчлөгдвөл хоёр талыг зэрэг өөрчилнө.
 */
export const PASSWORD_RULES: { key: string; label: string; test: (pw: string) => boolean }[] = [
  { key: 'len', label: 'Доод тал нь 8 тэмдэгт', test: (pw) => pw.length >= 8 },
  { key: 'upper', label: 'Том үсэг (A-Z, А-Я)', test: (pw) => /[A-ZА-ЯЁӨҮ]/.test(pw) },
  { key: 'lower', label: 'Жижиг үсэг (a-z, а-я)', test: (pw) => /[a-zа-яёөү]/.test(pw) },
  { key: 'digit', label: 'Тоо (0-9)', test: (pw) => /\d/.test(pw) },
  { key: 'special', label: 'Тусгай тэмдэгт (!@#$% г.м)', test: (pw) => /[^A-Za-zА-Яа-яЁёӨөҮү0-9\s]/.test(pw) },
];

export function passwordPolicyOk(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}

/** Live чеклист — нууц үг бичих явцад шаардлага бүр ногоорно. */
export function PasswordPolicyChecklist({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1 text-[12.5px]" aria-live="polite">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.key} className={ok ? 'text-emerald-600' : 'text-slate-400'}>
            {ok ? '✓' : '○'} {r.label}
          </li>
        );
      })}
    </ul>
  );
}
