import Link from 'next/link';

export function Logo({ dark = false, href = '/' }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="billingservice.mn нүүр хуудас">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-[15px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_6px_16px_-6px_rgba(79,70,229,0.6)]">
        ₮
      </span>
      <span className={`text-[17px] font-extrabold tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>
        billingservice<span className="bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent">.mn</span>
      </span>
    </Link>
  );
}
