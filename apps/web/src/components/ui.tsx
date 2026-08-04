'use client';

import { ReactNode } from 'react';
import type { InvoiceState } from '@/lib/types';
import { INVOICE_STATE_MN, RECEIPT_STATE_MN } from '@/lib/format';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin text-indigo-500 ${className}`} viewBox="0 0 24 24" fill="none" aria-label="Уншиж байна">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200/80 bg-red-50/80 px-4 py-3 text-sm text-red-700 backdrop-blur-md" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 rounded-lg bg-white/80 px-3 py-1.5 text-[13px] font-semibold text-red-700 shadow-sm hover:bg-white">
          ↻ Дахин оролдох
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-300/70 bg-white/50 px-6 py-14 text-center backdrop-blur-md">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/80 bg-white/70 text-2xl shadow-card">🗂</div>
      <p className="text-sm font-bold text-slate-900">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** High-fidelity status badge: soft glass pill + glowing status dot. */
function GlowBadge({ label, tone }: { label: string; tone: 'green' | 'blue' | 'indigo' | 'amber' | 'red' | 'slate' }) {
  const dot: Record<string, string> = {
    green: 'bg-emerald-500 shadow-glow-emerald',
    blue: 'bg-sky-500 shadow-[0_0_12px_rgba(14,165,233,0.55)]',
    indigo: 'bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.55)]',
    amber: 'bg-amber-500 shadow-glow-amber',
    red: 'bg-red-500 shadow-glow-red',
    slate: 'bg-slate-400',
  };
  const text: Record<string, string> = {
    green: 'text-emerald-700',
    blue: 'text-sky-700',
    indigo: 'text-indigo-700',
    amber: 'text-amber-700',
    red: 'text-red-600',
    slate: 'text-slate-500',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/60 px-2.5 py-1 text-[12px] font-bold backdrop-blur-md ${text[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} />
      {label}
    </span>
  );
}

const STATE_TONE: Record<InvoiceState, 'green' | 'blue' | 'indigo' | 'amber' | 'red' | 'slate'> = {
  DRAFT: 'slate',
  SENT: 'blue',
  VIEWED: 'indigo',
  PARTIALLY_PAID: 'amber',
  PAID: 'green',
  OVERDUE: 'red',
  CANCELLED: 'slate',
  EXPIRED: 'slate',
};

export function InvoiceBadge({ state }: { state: InvoiceState }) {
  return <GlowBadge label={INVOICE_STATE_MN[state] ?? state} tone={STATE_TONE[state] ?? 'slate'} />;
}

const RECEIPT_TONE: Record<string, 'green' | 'blue' | 'indigo' | 'amber' | 'red' | 'slate'> = {
  NOT_REQUIRED: 'slate',
  PENDING: 'amber',
  CREATED: 'green',
  DELIVERED: 'green',
  CANCEL_PENDING: 'amber',
  CANCELLED: 'slate',
  FAILED: 'red',
};

export function ReceiptBadge({ state }: { state: string }) {
  return <GlowBadge label={RECEIPT_STATE_MN[state] ?? state} tone={RECEIPT_TONE[state] ?? 'amber'} />;
}

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
}) {
  const toneCls =
    tone === 'positive' ? 'text-emerald-600' : tone === 'warning' ? 'text-amber-600' : tone === 'danger' ? 'text-red-600' : 'text-slate-900';
  return (
    <div className="card group p-6">
      <p className="text-[13px] font-semibold text-slate-500">{label}</p>
      <p className={`mt-1.5 text-[26px] font-extrabold leading-tight tracking-tight ${toneCls}`}>{value}</p>
      {sub && <p className="mt-1 text-[12.5px] text-slate-500">{sub}</p>}
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-lg animate-fade-up bg-white/85 p-7">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/80 hover:text-slate-700" aria-label="Хаах">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
