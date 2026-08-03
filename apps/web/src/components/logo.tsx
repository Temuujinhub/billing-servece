import Link from 'next/link';

export function Logo({ dark = false, href = '/' }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="billingservice.mn нүүр хуудас">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500 text-[15px] font-black text-white shadow-cta">
        ₮
      </span>
      <span className={`text-[17px] font-extrabold tracking-tight ${dark ? 'text-white' : 'text-navy-900'}`}>
        billingservice<span className="text-teal-500">.mn</span>
      </span>
    </Link>
  );
}
