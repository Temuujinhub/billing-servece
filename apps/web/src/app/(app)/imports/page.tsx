'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState, ErrorNote, PageLoader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dateTime, mnt } from '@/lib/format';
import type { BatchPreview, InspectResult } from '@/lib/types';

interface BatchRow {
  id: string;
  fileName: string | null;
  status: string;
  rowCount: number;
  validCount: number;
  errorCount: number;
  totalAmount: number;
  createdAt: string;
}

const STATUS_MN: Record<string, string> = {
  UPLOADED: 'Хуулсан',
  VALIDATED: 'Шалгасан',
  APPROVED: 'Баталгаажсан',
  DISPATCHED: 'Илгээсэн',
  CANCELLED: 'Цуцалсан',
};

/** CSV template served straight from the client — no round trip needed. */
function downloadTemplate() {
  const rows = [
    'phone_number,amount,description,name,email,due_date,customer_ref',
    '88112233,150000,10-р сарын сургалтын төлбөр,Бат Болд,bat@example.mn,2026-09-01,ST-1001',
    '99887766,85000,СӨХ ашиглалтын зардал,Сараа Дорж,,2026-09-01,',
  ];
  const blob = new Blob([`﻿${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'billingservice_template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ImportsPage() {
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | ''>>({});
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [done, setDone] = useState<{ created: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadBatches = useCallback(() => {
    api<{ items: BatchRow[]; total: number }>('/imports?take=10')
      .then((r) => setBatches(r.items))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  /** Step 1: parse only — show the column-mapping UI. */
  async function upload(file: File) {
    setUploading(true);
    setError(null);
    setDone(null);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api<InspectResult>('/imports/inspect', { method: 'POST', body: fd });
      setInspect(res);
      setPendingFile(file);
      const initial: Record<string, number | ''> = {};
      for (const f of res.systemFields) {
        initial[f.key] = res.suggested[f.key] ?? '';
      }
      setMapping(initial);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Файл боловсруулахад алдаа гарлаа');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /** Step 2: re-upload with the confirmed mapping → validation preview. */
  async function confirmMapping() {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', pendingFile);
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(mapping)) {
        if (v !== '') clean[k] = Number(v);
      }
      fd.append('mapping', JSON.stringify(clean));
      const res = await api<BatchPreview>('/imports', { method: 'POST', body: fd });
      setPreview(res);
      setInspect(null);
      setPendingFile(null);
      loadBatches();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Файл боловсруулахад алдаа гарлаа');
    } finally {
      setUploading(false);
    }
  }

  const mappingMissing = inspect
    ? inspect.systemFields.filter((f) => f.required && (mapping[f.key] === '' || mapping[f.key] === undefined))
    : [];

  async function approve() {
    if (!preview) return;
    setApproving(true);
    setError(null);
    try {
      const res = await api<{ created: number }>(`/imports/${preview.batch.id}/approve`, { method: 'POST' });
      setDone(res);
      setPreview(null);
      loadBatches();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Баталгаажуулахад алдаа гарлаа');
    } finally {
      setApproving(false);
    }
  }

  async function openBatch(id: string) {
    setError(null);
    setDone(null);
    try {
      setPreview(await api<BatchPreview>(`/imports/${id}`));
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Excel импорт</h1>
          <p className="mt-1 text-sm text-slate-500">Оруулах → шалгах → урьдчилан харах → баталгаажуулж илгээх</p>
        </div>
        <button onClick={downloadTemplate} className="btn-secondary">📄 Загвар татах (.csv)</button>
      </div>

      {/* Upload zone */}
      <div
        className={`card flex flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-12 text-center transition ${
          dragOver ? 'border-teal-400 bg-teal-50/50' : 'border-line'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
      >
        {uploading ? (
          <>
            <Spinner className="h-8 w-8" />
            <p className="text-sm font-medium text-navy-700">Файлыг шалгаж байна…</p>
          </>
        ) : (
          <>
            <span className="text-4xl" aria-hidden="true">📥</span>
            <p className="text-[15px] font-semibold text-navy-900">.xlsx эсвэл .csv файлаа энд чирж тавь</p>
            <p className="text-[13px] text-slate-500">Дээд тал нь 5MB, 5000 мөр. Мөр бүр илгээхээс өмнө шалгагдана.</p>
            <button onClick={() => fileRef.current?.click()} className="btn-primary mt-1">Файл сонгох</button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </>
        )}
      </div>

      {error && <ErrorNote message={error} />}
      {done && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          ✅ {done.created} нэхэмжлэх үүсгэж, SMS линкүүд илгээгдлээ.{' '}
          <Link href="/invoices" className="font-semibold underline">Нэхэмжлэхүүд үзэх</Link>
        </div>
      )}

      {/* Column mapping step (wireframe M-08) */}
      {inspect && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 px-6 py-4">
            <div>
              <h2 className="font-bold text-slate-900">Багана тааруулах — {inspect.fileName}</h2>
              <p className="text-[13px] text-slate-500">{inspect.rowCount} мөр · Аль багана аль талбарт орохыг сонгоно уу</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="btn-secondary" onClick={() => { setInspect(null); setPendingFile(null); }}>Болих</button>
              <button className="btn-primary" onClick={confirmMapping} disabled={uploading || mappingMissing.length > 0}>
                {uploading ? <Spinner className="h-5 w-5 text-white" /> : 'Үргэлжлүүлж шалгах →'}
              </button>
            </div>
          </div>
          {mappingMissing.length > 0 && (
            <p className="border-b border-slate-200/60 bg-amber-50 px-6 py-2.5 text-[13px] font-medium text-amber-800">
              Заавал тааруулах: {mappingMissing.map((f) => f.label).join(', ')}
            </p>
          )}
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="th">Системийн талбар</th>
                  <th className="th">Файлын багана</th>
                  <th className="th">Жишээ утгууд</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {inspect.systemFields.map((f) => {
                  const selected = mapping[f.key];
                  const usedElsewhere = new Set(
                    Object.entries(mapping)
                      .filter(([k, v]) => k !== f.key && v !== '')
                      .map(([, v]) => Number(v)),
                  );
                  const col = selected !== '' && selected !== undefined ? inspect.columns[Number(selected)] : null;
                  return (
                    <tr key={f.key}>
                      <td className="td">
                        <span className="font-semibold text-navy-900">{f.label}</span>
                        {f.required ? <span className="ml-1 text-red-500">*</span> : <span className="ml-1 text-[11px] text-slate-500">(заавал биш)</span>}
                      </td>
                      <td className="td">
                        <select
                          className="input max-w-[240px]"
                          value={selected === undefined ? '' : selected}
                          onChange={(e) =>
                            setMapping((m) => ({ ...m, [f.key]: e.target.value === '' ? '' : Number(e.target.value) }))
                          }
                          aria-label={`${f.label} багана сонгох`}
                        >
                          <option value="">— Оруулахгүй —</option>
                          {inspect.columns.map((c) => (
                            <option key={c.index} value={c.index} disabled={usedElsewhere.has(c.index)}>
                              {c.header}{usedElsewhere.has(c.index) ? ' (сонгогдсон)' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="td max-w-[280px] truncate text-[12.5px] text-slate-500">
                        {col ? col.samples.filter(Boolean).join(' · ') || '—' : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Validation preview */}
      {preview && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/60 px-6 py-4">
            <div>
              <h2 className="font-bold text-slate-900">{preview.batch.fileName ?? 'Импорт'}</h2>
              <p className="text-[13px] text-slate-500">
                {preview.batch.rowCount} мөр · <span className="font-semibold text-indigo-600">{preview.batch.validCount} зөв</span>
                {preview.batch.errorCount > 0 && <> · <span className="font-semibold text-red-600">{preview.batch.errorCount} алдаатай</span></>}
              </p>
            </div>
            {preview.batch.status === 'VALIDATED' && (
              <div className="flex items-center gap-4">
                <div className="text-right text-[13px]">
                  <p className="font-bold text-slate-900">{mnt(preview.batch.totalAmount)}</p>
                  <p className="text-slate-500">SMS ~{preview.estimate.smsSegments} segment ≈ {mnt(preview.estimate.smsCost)}</p>
                </div>
                <button onClick={approve} disabled={approving || preview.batch.validCount === 0} className="btn-primary">
                  {approving ? <Spinner className="h-5 w-5 text-white" /> : `Баталгаажуулж илгээх (${preview.batch.validCount})`}
                </button>
              </div>
            )}
            {preview.batch.status === 'DISPATCHED' && (
              <span className="rounded-full bg-teal-50 px-3 py-1.5 text-[13px] font-bold text-indigo-700">Илгээгдсэн ✓</span>
            )}
          </div>
          <div className="scroll-thin max-h-[420px] overflow-auto">
            <table className="w-full min-w-[720px]">
              <thead className="sticky top-0 bg-navy-50">
                <tr>
                  <th className="th">Мөр</th>
                  <th className="th">Утас</th>
                  <th className="th">Нэр</th>
                  <th className="th text-right">Дүн</th>
                  <th className="th">Тайлбар</th>
                  <th className="th">Шалгалт</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {preview.rows.map((r) => (
                  <tr key={r.rowNo} className={r.valid ? '' : 'bg-red-50/50'}>
                    <td className="td text-slate-500">{r.rowNo}</td>
                    <td className="td font-mono text-[13px]">{r.normalized?.phone ?? r.raw.phone_number ?? '—'}</td>
                    <td className="td">{r.normalized?.customerName ?? r.raw.name ?? '—'}</td>
                    <td className="td text-right font-semibold">{r.normalized ? mnt(r.normalized.amount) : (r.raw.amount ?? '—')}</td>
                    <td className="td max-w-[200px] truncate text-slate-500">{r.normalized?.description ?? r.raw.description ?? '—'}</td>
                    <td className="td">
                      {r.valid ? (
                        r.warnings?.length ? (
                          <span className="text-[12.5px] font-medium text-amber-600">⚠ {r.warnings.join('; ')}</span>
                        ) : (
                          <span className="text-[12.5px] font-semibold text-indigo-600">✓ Зөв</span>
                        )
                      ) : (
                        <span className="text-[12.5px] font-medium text-red-600">{r.errors?.join('; ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Past batches */}
      <div className="card overflow-hidden">
        <h2 className="px-6 py-4 font-bold text-slate-900">Өмнөх импортууд</h2>
        {!batches ? (
          <PageLoader />
        ) : batches.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState title="Импорт хийгдээгүй байна" hint="Загвар татаад эхний файлаа оруулаарай." />
          </div>
        ) : (
          <table className="w-full border-t border-slate-200/60">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="th">Файл</th>
                <th className="th">Огноо</th>
                <th className="th">Мөр</th>
                <th className="th text-right">Дүн</th>
                <th className="th">Төлөв</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {batches.map((b) => (
                <tr key={b.id} className="cursor-pointer transition hover:bg-white/60" onClick={() => void openBatch(b.id)}>
                  <td className="td font-medium text-indigo-700">{b.fileName ?? b.id.slice(0, 8)}</td>
                  <td className="td text-slate-500">{dateTime(b.createdAt)}</td>
                  <td className="td">{b.validCount}/{b.rowCount}</td>
                  <td className="td text-right font-semibold">{mnt(b.totalAmount)}</td>
                  <td className="td">{STATUS_MN[b.status] ?? b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
