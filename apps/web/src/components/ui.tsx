'use client';

import { ReactNode } from 'react';
import type { InvoiceState } from '@/lib/types';
import { INVOICE_STATE_MN, RECEIPT_STATE_MN } from '@/lib/format';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin text-teal-500 ${className}`} viewBox="0 0 24 24" fill="none" aria-label="Уншиж байна">
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

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {message}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-2xl">🗂</div>
      <p className="text-sm font-semibold text-navy-800">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const STATE_STYLE: Record<InvoiceState, string> = {
  DRAFT: 'bg-navy-50 text-navy-600 ring-navy-200',
  SENT: 'bg-blue-50 text-blue-700 ring-blue-200',
  VIEWED: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-700 ring-amber-200',
  PAID: 'bg-teal-50 text-teal-700 ring-teal-200',
  OVERDUE: 'bg-red-50 text-red-700 ring-red-200',
  CANCELLED: 'bg-navy-50 text-navy-500 ring-navy-200',
  EXPIRED: 'bg-navy-50 text-navy-500 ring-navy-200',
};

export function InvoiceBadge({ state }: { state: InvoiceState }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${STATE_STYLE[state] ?? STATE_STYLE.DRAFT}`}>
      {INVOICE_STATE_MN[state] ?? state}
    </span>
  );
}

const RECEIPT_STYLE: Record<string, string> = {
  NOT_REQUIRED: 'bg-navy-50 text-navy-500 ring-navy-200',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  CREATED: 'bg-teal-50 text-teal-700 ring-teal-200',
  DELIVERED: 'bg-teal-50 text-teal-700 ring-teal-200',
  CANCEL_PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  CANCELLED: 'bg-navy-50 text-navy-500 ring-navy-200',
  FAILED: 'bg-red-50 text-red-700 ring-red-200',
};

export function ReceiptBadge({ state }: { state: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${RECEIPT_STYLE[state] ?? RECEIPT_STYLE.PENDING}`}>
      {RECEIPT_STATE_MN[state] ?? state}
    </span>
  );
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
    tone === 'positive' ? 'text-teal-600' : tone === 'warning' ? 'text-amber-600' : tone === 'danger' ? 'text-red-600' : 'text-navy-900';
  return (
    <div className="card px-5 py-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className={`mt-1.5 text-[26px] font-bold leading-tight tracking-tight ${toneCls}`}>{value}</p>
      {sub && <p className="mt-1 text-[12.5px] text-muted">{sub}</p>}
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
      <div className="absolute inset-0 bg-navy-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-lg animate-fade-up p-6">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-bold text-navy-900">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-navy-50" aria-label="Хаах">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
