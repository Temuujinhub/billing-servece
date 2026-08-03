import type { InvoiceState } from './types';

export function mnt(amount: number): string {
  return `${(amount ?? 0).toLocaleString('en-US')}₮`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`;
}

export const INVOICE_STATE_MN: Record<InvoiceState, string> = {
  DRAFT: 'Ноорог',
  SENT: 'Илгээсэн',
  VIEWED: 'Нээсэн',
  PARTIALLY_PAID: 'Хэсэгчлэн төлсөн',
  PAID: 'Төлсөн',
  OVERDUE: 'Хугацаа хэтэрсэн',
  CANCELLED: 'Цуцалсан',
  EXPIRED: 'Хүчингүй болсон',
};

export const RECEIPT_STATE_MN: Record<string, string> = {
  NOT_REQUIRED: 'Шаардлагагүй',
  PENDING: 'Хүлээгдэж буй',
  CREATED: 'Үүссэн',
  DELIVERED: 'Хүргэгдсэн',
  CANCEL_PENDING: 'Цуцлагдаж буй',
  CANCELLED: 'Цуцлагдсан',
  FAILED: 'Амжилтгүй',
};

export const MESSAGE_STATE_MN: Record<string, string> = {
  QUEUED: 'Дараалалд',
  SUBMITTED: 'Илгээсэн',
  DELIVERED: 'Хүргэгдсэн',
  FAILED: 'Амжилтгүй',
};
