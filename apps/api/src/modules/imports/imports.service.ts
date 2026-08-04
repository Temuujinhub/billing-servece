import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { AuthUser } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { normalizeMnPhone, smsSegments } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { InvoicesService } from '../invoices/invoices.service';
import { MAX_INVOICE_AMOUNT } from '../invoices/invoices.dto';
import { MessagingService } from '../messaging/messaging.service';

const MAX_ROWS = 5000; // MVP guardrail; PRD targets 50k rows via async workers in Phase 2

/** System fields a file column can be mapped to (wireframe M-08). */
export const SYSTEM_FIELDS = [
  { key: 'phone_number', label: 'Утасны дугаар', required: true },
  { key: 'amount', label: 'Дүн (₮)', required: true },
  { key: 'description', label: 'Тайлбар', required: true },
  { key: 'customer_name', label: 'Харилцагчийн нэр', required: false },
  { key: 'email', label: 'Имэйл', required: false },
  { key: 'due_date', label: 'Төлөх хугацаа', required: false },
  { key: 'customer_ref', label: 'Харилцагчийн код', required: false },
] as const;

type SystemFieldKey = (typeof SYSTEM_FIELDS)[number]['key'];

const HEADER_ALIASES: Record<string, SystemFieldKey> = {
  phone: 'phone_number', phone_number: 'phone_number', 'утас': 'phone_number', 'утасны дугаар': 'phone_number', 'дугаар': 'phone_number',
  amount: 'amount', 'дүн': 'amount', 'мөнгөн дүн': 'amount', 'төлбөр': 'amount', 'үнэ': 'amount',
  description: 'description', 'тайлбар': 'description', 'утга': 'description', 'гүйлгээний утга': 'description',
  email: 'email', 'имэйл': 'email', 'и-мэйл': 'email', 'мэйл': 'email',
  due_date: 'due_date', duedate: 'due_date', 'хугацаа': 'due_date', 'дуусах хугацаа': 'due_date', 'төлөх хугацаа': 'due_date', 'огноо': 'due_date',
  customer_ref: 'customer_ref', ref: 'customer_ref', 'код': 'customer_ref', 'бүртгэлийн код': 'customer_ref',
  name: 'customer_name', customer_name: 'customer_name', 'нэр': 'customer_name', 'харилцагч': 'customer_name', 'овог нэр': 'customer_name',
};

/** Parsed file as a raw matrix — mapping is applied afterwards. */
interface ParsedMatrix {
  headers: string[];
  rows: { rowNo: number; cells: string[] }[];
}

interface ParsedRow {
  rowNo: number;
  raw: Record<string, string>;
}

interface ValidatedRow {
  rowNo: number;
  raw: Record<string, string>;
  normalized: {
    phone: string;
    amount: number;
    description: string;
    customerName: string;
    email: string | null;
    dueDate: string | null;
    customerRef: string | null;
  } | null;
  errors: string[];
  warnings: string[];
}

export type ColumnMapping = Partial<Record<SystemFieldKey, number>>;

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly invoices: InvoicesService,
    private readonly messaging: MessagingService,
  ) {}

  // ---------------------------------------------------------------- inspect

  /**
   * Step 1 of the wizard: parse the file and return its columns + sample
   * values + a suggested mapping. Nothing is written to the database — the
   * client re-uploads the same file together with the confirmed mapping.
   */
  async inspect(file: Express.Multer.File) {
    const matrix = await this.parseFile(file);
    const suggested = this.suggestMapping(matrix.headers);
    return {
      fileName: file.originalname,
      rowCount: matrix.rows.length,
      columns: matrix.headers.map((header, index) => ({
        index,
        header: header || `Багана ${index + 1}`,
        samples: matrix.rows.slice(0, 3).map((r) => r.cells[index] ?? ''),
      })),
      suggested,
      systemFields: SYSTEM_FIELDS,
    };
  }

  // ----------------------------------------------------------------- upload

  /** Upload + map + validate in one step; nothing financial is created yet. */
  async upload(user: AuthUser, file: Express.Multer.File, mappingRaw?: string) {
    const matrix = await this.parseFile(file);
    if (matrix.rows.length === 0) {
      throw apiError(HttpStatus.BAD_REQUEST, 'EMPTY_FILE', 'Файлд өгөгдөл олдсонгүй.', 'No data rows found in the file.');
    }
    if (matrix.rows.length > MAX_ROWS) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'TOO_MANY_ROWS',
        `Нэг удаад дээд тал нь ${MAX_ROWS} мөр импортлох боломжтой.`,
        `At most ${MAX_ROWS} rows per import in this version.`,
      );
    }

    const mapping = mappingRaw ? this.parseMapping(mappingRaw, matrix.headers.length) : this.suggestMapping(matrix.headers);
    const missing = SYSTEM_FIELDS.filter((f) => f.required && mapping[f.key] === undefined);
    if (missing.length > 0) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'MAPPING_REQUIRED',
        `Дараах талбаруудыг багантай тааруулна уу: ${missing.map((f) => f.label).join(', ')}`,
        `Map required fields: ${missing.map((f) => f.key).join(', ')}`,
      );
    }

    const rows = this.toRecords(matrix, mapping);
    const validated = rows.map((r) => this.validateRow(r));

    // Duplicate detection inside the file: same phone + amount + description.
    const seen = new Map<string, number>();
    for (const v of validated) {
      if (!v.normalized) continue;
      const key = `${v.normalized.phone}|${v.normalized.amount}|${v.normalized.description}`;
      const first = seen.get(key);
      if (first !== undefined) {
        v.warnings.push(`${first}-р мөртэй давхардаж байна (утас+дүн+тайлбар ижил)`);
      } else {
        seen.set(key, v.rowNo);
      }
    }

    const validRows = validated.filter((v) => v.errors.length === 0 && v.normalized);
    const totalAmount = validRows.reduce((s, v) => s + (v.normalized?.amount ?? 0), 0);

    const batch = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.invoiceBatch.create({
        data: {
          tenantId: user.tenantId,
          source: (file.originalname || '').toLowerCase().endsWith('.csv') ? 'csv' : 'excel',
          fileName: file.originalname?.slice(0, 200),
          status: 'VALIDATED',
          rowCount: validated.length,
          validCount: validRows.length,
          errorCount: validated.length - validRows.length,
          totalAmount,
          createdById: user.userId,
        },
      });
      // createMany keeps 5k-row inserts fast.
      await tx.importRow.createMany({
        data: validated.map((v) => ({
          batchId: batch.id,
          rowNo: v.rowNo,
          raw: v.raw as Prisma.InputJsonValue,
          normalized: (v.normalized ?? undefined) as Prisma.InputJsonValue | undefined,
          errors: v.errors.length ? v.errors : undefined,
          warnings: v.warnings.length ? v.warnings : undefined,
          valid: v.errors.length === 0,
        })),
      });
      return batch;
    });

    return this.preview(user.tenantId, batch.id);
  }

  /** Validation report + cost estimate (SMS segments, service fee preview). */
  async preview(tenantId: string, batchId: string) {
    const batch = await this.prisma.invoiceBatch.findFirst({
      where: { id: batchId, tenantId },
      include: { rows: { orderBy: { rowNo: 'asc' }, take: 1000 } },
    });
    if (!batch) {
      throw apiError(HttpStatus.NOT_FOUND, 'BATCH_NOT_FOUND', 'Импортын багц олдсонгүй.', 'Import batch not found.');
    }
    let smsSegmentEstimate = 0;
    for (const row of batch.rows) {
      if (!row.valid || !row.normalized) continue;
      const n = row.normalized as any;
      // The SMS body includes tenant name + amount + link; ~40 extra chars.
      smsSegmentEstimate += smsSegments(`X: Танд ${n.amount}₮ нэхэмжлэх ирлээ. Төлөх: https://billing.mastrsys.com/p/XXXXXXXX`);
    }
    return {
      batch: {
        id: batch.id,
        status: batch.status,
        fileName: batch.fileName,
        rowCount: batch.rowCount,
        validCount: batch.validCount,
        errorCount: batch.errorCount,
        totalAmount: batch.totalAmount,
        createdAt: batch.createdAt,
      },
      rows: batch.rows.map((r) => ({
        rowNo: r.rowNo,
        raw: r.raw,
        normalized: r.normalized,
        errors: r.errors,
        warnings: r.warnings,
        valid: r.valid,
      })),
      estimate: {
        smsSegments: smsSegmentEstimate,
        smsCost: smsSegmentEstimate * 25, // business assumption from the PRD, confirm with provider contract
      },
    };
  }

  async listBatches(tenantId: string, take = 20, skip = 0) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoiceBatch.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(take, 100),
        skip,
      }),
      this.prisma.invoiceBatch.count({ where: { tenantId } }),
    ]);
    return { items, total };
  }

  /**
   * Approve: turn every VALID row into a real invoice + short link + SMS.
   * Chunked transactions keep memory/locks bounded; the batch flips to
   * APPROVED first so a double-click can't dispatch twice (idempotency).
   */
  async approve(user: AuthUser, batchId: string) {
    const batch = await this.prisma.invoiceBatch.findFirst({ where: { id: batchId, tenantId: user.tenantId } });
    if (!batch) {
      throw apiError(HttpStatus.NOT_FOUND, 'BATCH_NOT_FOUND', 'Импортын багц олдсонгүй.', 'Import batch not found.');
    }
    if (batch.status !== 'VALIDATED') {
      throw apiError(
        HttpStatus.CONFLICT,
        'BATCH_NOT_APPROVABLE',
        `Багц ${batch.status} төлөвтэй тул баталгаажуулах боломжгүй.`,
        `Batch is ${batch.status}; only VALIDATED batches can be approved.`,
      );
    }
    if (batch.validCount === 0) {
      throw apiError(HttpStatus.BAD_REQUEST, 'NO_VALID_ROWS', 'Зөв мөр алга. Алдааг засаад дахин оруулна уу.', 'No valid rows to approve.');
    }

    // Claim the batch atomically — the guard below makes double-submit a no-op.
    const claimed = await this.prisma.invoiceBatch.updateMany({
      where: { id: batchId, status: 'VALIDATED' },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw apiError(HttpStatus.CONFLICT, 'ALREADY_APPROVED', 'Багц аль хэдийн баталгаажсан байна.', 'Batch already approved.');
    }

    const rows = await this.prisma.importRow.findMany({
      where: { batchId, valid: true },
      orderBy: { rowNo: 'asc' },
    });

    let created = 0;
    const CHUNK = 50;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await this.prisma.$transaction(async (tx) => {
        for (const row of chunk) {
          const n = row.normalized as any;
          const customer = await this.customers.upsertForImport(tx, user.tenantId, {
            name: n.customerName,
            phone: n.phone,
            email: n.email,
            externalRef: n.customerRef,
          });
          const invoice = await this.invoices.createInvoiceRow(tx, {
            tenantId: user.tenantId,
            customerId: customer.id,
            amount: n.amount,
            description: n.description,
            dueDate: n.dueDate ? new Date(n.dueDate) : null,
            batchId,
          });
          await this.invoices.dispatchInvoice(tx, invoice.id, user.tenantId);
          created += 1;
        }
      });
    }

    // Submit the queued SMS jobs now that all chunks are committed.
    await this.messaging.dispatchQueued(user.tenantId);

    await this.prisma.$transaction([
      this.prisma.invoiceBatch.update({ where: { id: batchId }, data: { status: 'DISPATCHED' } }),
      this.prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorId: user.userId,
          actorEmail: user.email,
          action: 'batch.approved_and_dispatched',
          targetType: 'batch',
          targetId: batchId,
          meta: { created, totalAmount: batch.totalAmount },
        },
      }),
    ]);

    return { batchId, created, status: 'DISPATCHED' };
  }

  // ---------------------------------------------------------------- parsing

  private async parseFile(file: Express.Multer.File): Promise<ParsedMatrix> {
    if (!file?.buffer?.length) {
      throw apiError(HttpStatus.BAD_REQUEST, 'FILE_REQUIRED', 'Файл сонгоно уу.', 'A file is required.');
    }
    const name = (file.originalname || 'import').toLowerCase();
    if (name.endsWith('.csv')) return this.parseCsv(file.buffer.toString('utf8'));
    if (name.endsWith('.xlsx')) return this.parseXlsx(file.buffer);
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'UNSUPPORTED_FORMAT',
      'Зөвхөн .xlsx эсвэл .csv файл дэмжинэ.',
      'Only .xlsx or .csv files are supported.',
    );
  }

  private parseCsv(text: string): ParsedMatrix {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = this.splitCsvLine(lines[0]).map((h) => h.trim());
    const rows: ParsedMatrix['rows'] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = this.splitCsvLine(lines[i]).map((c) => c.trim());
      if (cells.some((c) => c !== '')) rows.push({ rowNo: i + 1, cells });
    }
    return { headers, rows };
  }

  /** Minimal RFC-4180 field splitter (quotes + escaped quotes). */
  private splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  private async parseXlsx(buffer: Buffer): Promise<ParsedMatrix> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw apiError(HttpStatus.BAD_REQUEST, 'BAD_XLSX', 'Excel файлыг уншиж чадсангүй.', 'Could not parse the .xlsx file.');
    }
    const ws = wb.worksheets[0];
    if (!ws) return { headers: [], rows: [] };

    const cellText = (cell: ExcelJS.Cell): string => {
      let v: unknown = cell.value;
      if (v && typeof v === 'object') {
        if (v instanceof Date) v = v.toISOString().slice(0, 10);
        else if ('text' in (v as any)) v = (v as any).text;
        else if ('result' in (v as any)) v = (v as any).result;
      }
      return v === null || v === undefined ? '' : String(v).trim();
    };

    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = cellText(cell);
    });
    const rows: ParsedMatrix['rows'] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      if (rowNo === 1) return;
      const cells: string[] = new Array(headers.length).fill('');
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cellText(cell);
      });
      if (cells.some((c) => c !== '')) rows.push({ rowNo, cells });
    });
    return { headers, rows };
  }

  // ---------------------------------------------------------------- mapping

  private suggestMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};
    headers.forEach((h, index) => {
      const key = HEADER_ALIASES[h.trim().toLowerCase()];
      if (key && mapping[key] === undefined) mapping[key] = index;
    });
    return mapping;
  }

  private parseMapping(raw: string, columnCount: number): ColumnMapping {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw apiError(HttpStatus.BAD_REQUEST, 'BAD_MAPPING', 'Багана тааруулалт буруу форматтай.', 'mapping must be a JSON object.');
    }
    const mapping: ColumnMapping = {};
    const validKeys = new Set(SYSTEM_FIELDS.map((f) => f.key as string));
    const usedColumns = new Set<number>();
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!validKeys.has(key) || value === null || value === undefined || value === '') continue;
      const idx = Number(value);
      if (!Number.isInteger(idx) || idx < 0 || idx >= columnCount) {
        throw apiError(HttpStatus.BAD_REQUEST, 'BAD_MAPPING', `«${key}» талбарын багана буруу байна.`, `Invalid column index for ${key}.`);
      }
      if (usedColumns.has(idx)) {
        throw apiError(HttpStatus.BAD_REQUEST, 'DUPLICATE_COLUMN', 'Нэг баганыг хоёр талбарт тааруулж болохгүй.', 'A column cannot be mapped to two fields.');
      }
      usedColumns.add(idx);
      mapping[key as SystemFieldKey] = idx;
    }
    return mapping;
  }

  private toRecords(matrix: ParsedMatrix, mapping: ColumnMapping): ParsedRow[] {
    return matrix.rows.map((row) => {
      const raw: Record<string, string> = {};
      for (const field of SYSTEM_FIELDS) {
        const idx = mapping[field.key];
        if (idx !== undefined) raw[field.key] = row.cells[idx] ?? '';
      }
      return { rowNo: row.rowNo, raw };
    });
  }

  // ------------------------------------------------------------- validation

  private validateRow(row: ParsedRow): ValidatedRow {
    const errors: string[] = [];
    const warnings: string[] = [];
    const r = row.raw;

    const phone = normalizeMnPhone(r.phone_number ?? '');
    if (!phone) errors.push('Утасны дугаар буруу (8 орон эсвэл +976 форматтай байх ёстой)');

    const amountRaw = (r.amount ?? '').replace(/[,\s₮]/g, '');
    const amount = Number(amountRaw);
    if (!amountRaw || !Number.isInteger(amount) || amount <= 0) {
      errors.push('Дүн эерэг бүхэл тоо байх ёстой (MNT)');
    } else if (amount > MAX_INVOICE_AMOUNT) {
      errors.push(`Дүн хэт их байна (max ${MAX_INVOICE_AMOUNT.toLocaleString()}₮)`);
    }

    const description = (r.description ?? '').trim();
    if (!description) errors.push('Тайлбар хоосон байна');
    else if (description.length > 160) errors.push('Тайлбар 160 тэмдэгтээс хэтэрсэн');

    const email = (r.email ?? '').trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      warnings.push('Имэйл формат эргэлзээтэй — илгээлт зөвхөн SMS-ээр хийгдэнэ');
    }

    let dueDate: string | null = null;
    const rawDue = (r.due_date ?? '').trim();
    if (rawDue) {
      const m = rawDue.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (!m) {
        errors.push('Хугацаа YYYY-MM-DD форматтай байх ёстой');
      } else {
        const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
        if (Number.isNaN(d.getTime())) errors.push('Хугацаа буруу огноо байна');
        else {
          dueDate = d.toISOString();
          if (d.getTime() < Date.now() - 864e5) warnings.push('Хугацаа өнгөрсөн огноо байна');
        }
      }
    }

    const customerName = (r.customer_name ?? '').trim() || (phone ? `Харилцагч ${phone.slice(-4)}` : '');
    const customerRef = (r.customer_ref ?? '').trim() || null;

    return {
      rowNo: row.rowNo,
      raw: r,
      normalized:
        errors.length === 0 && phone
          ? { phone, amount, description, customerName, email, dueDate, customerRef }
          : null,
      errors,
      warnings,
    };
  }
}
