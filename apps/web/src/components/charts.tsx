'use client';

/**
 * Dependency-free SVG charts tuned for the dashboard: a soft area chart for
 * daily collections and a donut for invoice state split. Small, accessible,
 * fully theme-colored — no charting library payload.
 */

export function AreaChart({
  data,
  height = 180,
  formatValue,
}: {
  data: { date: string; amount: number }[];
  height?: number;
  formatValue: (n: number) => string;
}) {
  const width = 640;
  const pad = { top: 14, right: 8, bottom: 22, left: 8 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.amount));
  const step = data.length > 1 ? w / (data.length - 1) : w;

  const pts = data.map((d, i) => ({
    x: pad.left + i * step,
    y: pad.top + h - (d.amount / max) * h,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${(pad.left + w).toFixed(1)},${pad.top + h} L${pad.left},${pad.top + h} Z`;
  const last = data[data.length - 1];
  const peak = data.reduce((a, b) => (b.amount > a.amount ? b : a), data[0] ?? { date: '', amount: 0 });

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Сүүлийн 30 хоногийн төлөлт">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad.left}
            x2={pad.left + w}
            y1={pad.top + h * f}
            y2={pad.top + h * f}
            stroke="rgba(148,163,184,0.3)"
            strokeDasharray="3 5"
          />
        ))}
        {data.length > 0 && (
          <>
            <path d={area} fill="url(#areaFill)" />
            <path d={line} fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {pts.length > 0 && <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="4" fill="#6366F1" stroke="#fff" strokeWidth="2" />}
          </>
        )}
        {data.length > 0 && (
          <>
            <text x={pad.left} y={height - 6} fontSize="11" fill="#5D7186">
              {data[0].date.slice(5)}
            </text>
            <text x={pad.left + w} y={height - 6} fontSize="11" fill="#5D7186" textAnchor="end">
              {last?.date.slice(5)}
            </text>
          </>
        )}
      </svg>
      {peak && peak.amount > 0 && (
        <p className="mt-1 text-right text-[12px] text-slate-500">
          Оргил: {peak.date.slice(5)} — <span className="font-semibold text-navy-800">{formatValue(peak.amount)}</span>
        </p>
      )}
    </div>
  );
}

export function Donut({
  segments,
  size = 168,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  centerLabel: string;
  centerValue: string;
}) {
  const total = Math.max(
    1,
    segments.reduce((s, x) => s + x.value, 0),
  );
  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label={centerLabel}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="18" />
        {segments.map((s) => {
          const frac = s.value / total;
          const dash = `${frac * c} ${c}`;
          const el = (
            <circle
              key={s.label}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="18"
              strokeDasharray={dash}
              strokeDashoffset={-offset * c}
              transform="rotate(-90 80 80)"
              strokeLinecap="butt"
            />
          );
          offset += frac;
          return el;
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="20" fontWeight="700" fill="#132A42">
          {centerValue}
        </text>
        <text x="80" y="94" textAnchor="middle" fontSize="11" fill="#5D7186">
          {centerLabel}
        </text>
      </svg>
      <ul className="space-y-1.5 text-[13px]">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-navy-700">{s.label}</span>
            <span className="ml-auto pl-3 font-semibold text-navy-900">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
