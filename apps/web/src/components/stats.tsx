'use client';

/**
 * Premium fintech stat cards: neon trend sparkline, layered gradient progress
 * bar and a radial percentage ring — all dependency-free SVG.
 */

/** Card 1 — headline figure with a glowing neon-green trend line. */
export function StatTrend({
  label,
  value,
  sub,
  series,
}: {
  label: string;
  value: string;
  sub?: string;
  series: number[];
}) {
  const w = 260;
  const h = 56;
  const max = Math.max(1, ...series);
  const step = series.length > 1 ? w / (series.length - 1) : w;
  const pts = series.map((v, i) => `${(i * step).toFixed(1)},${(h - 6 - (v / max) * (h - 12)).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;

  return (
    <div className="card group relative overflow-hidden p-6">
      <p className="text-[13px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-[12.5px] text-slate-500">{sub}</p>}
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full opacity-90 transition-opacity duration-500 group-hover:opacity-100" aria-hidden="true">
        <defs>
          <linearGradient id="neonFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34D399" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#34D399" stopOpacity="0" />
          </linearGradient>
          <filter id="neonGlow" x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {series.length > 1 && (
          <>
            <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#neonFill)" />
            <path d={line} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#neonGlow)" />
          </>
        )}
      </svg>
    </div>
  );
}

/** Card 2 — value with a multi-layered premium gradient progress bar. */
export function StatProgress({
  label,
  value,
  sub,
  percent,
}: {
  label: string;
  value: string;
  sub?: string;
  percent: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="card group p-6">
      <p className="text-[13px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-[12.5px] text-slate-500">{sub}</p>}
      <div className="mt-5">
        <div className="flex items-baseline justify-between text-[12px] font-semibold">
          <span className="text-slate-500">Төлөлтийн хувь</span>
          <span className="text-indigo-600">{clamped}%</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full border border-white/80 bg-slate-200/60 shadow-[inset_0_1px_3px_rgba(15,23,42,0.08)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-blue-500 to-sky-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_0_14px_rgba(79,70,229,0.5)] transition-all duration-700"
            style={{ width: `${clamped}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/** Card 3 — modern radial percentage ring (eBarimt automation health). */
export function StatRing({
  label,
  value,
  sub,
  percent,
  tone = 'indigo',
}: {
  label: string;
  value: string;
  sub?: string;
  percent: number;
  tone?: 'indigo' | 'emerald' | 'amber';
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = tone === 'emerald' ? '#10B981' : tone === 'amber' ? '#F59E0B' : '#6366F1';
  return (
    <div className="card group flex items-center justify-between gap-4 p-6">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-slate-500">{label}</p>
        <p className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">{value}</p>
        {sub && <p className="mt-1 text-[12.5px] text-slate-500">{sub}</p>}
      </div>
      <svg width="92" height="92" viewBox="0 0 92 92" className="shrink-0" role="img" aria-label={`${clamped}%`}>
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="9" />
        <circle
          cx="46"
          cy="46"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          transform="rotate(-90 46 46)"
          style={{ filter: `drop-shadow(0 0 6px ${color}66)`, transition: 'stroke-dasharray 0.7s ease' }}
        />
        <text x="46" y="51" textAnchor="middle" fontSize="17" fontWeight="800" fill="#0f172a">
          {clamped}%
        </text>
      </svg>
    </div>
  );
}
