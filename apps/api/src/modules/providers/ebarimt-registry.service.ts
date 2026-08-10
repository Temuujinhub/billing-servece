import { Injectable, Logger } from '@nestjs/common';

/**
 * ТЕГ-ийн НЭЭЛТТЭЙ бүртгэлийн лавлагаа (api.ebarimt.mn — auth шаардахгүй).
 *
 *   GET /api/info/check/getTinInfo?regNo=5037409   → { data: "<ТТД>" }
 *   GET /api/info/check/getInfo?tin=<ТТД>          → байгууллагын нэр
 *
 * ТТД (TIN) нь POS API 3.0-ийн `merchantTin`-тэй ижил дугаар тул регистрээр
 * нэг удаа шалгаад байгууллагын нэр + merchantTin-ийг автоматаар бөглөнө.
 * Сервис унасан ч онбординг зогсохгүй — бүх алдаа null болж буцна.
 */
const BASE = 'https://api.ebarimt.mn/api/info/check';

export interface EbarimtRegistryInfo {
  regNo: string;
  /** Татвар төлөгчийн дугаар = POS API-ийн merchantTin. */
  tin: string | null;
  name: string | null;
  found: boolean;
  /** НӨАТ суутган төлөгч эсэх — баримтын taxType-г үүгээр шийднэ. */
  vatPayer: boolean | null;
  /** НӨАТ-аас чөлөөлөгдөх төсөл (VAT_FREE + taxProductCode 304). */
  vatFreeProject: boolean | null;
  /** НХАТ суутган төлөгч (зөвхөн Улаанбаатарт үйл ажиллагаа явуулах үед). */
  cityPayer: boolean | null;
  vatPayerSince: string | null;
}

/** ТЕГ-ийн байршлын код: аймаг/дүүрэг (2) + сум/хороо (2) = 4 орон. */
export interface EbarimtDistrict {
  /** districtCode — баримтад дамжуулах 4 оронтой код. */
  code: string;
  /** «Архангай — Чулуут» хэлбэрийн дэлгэцийн нэр. */
  label: string;
  branchName: string;
  subBranchName: string;
}

/** Байршлын кодын жагсаалт ховор өөрчлөгддөг — өдөрт нэг татна. */
const DISTRICT_TTL_MS = 24 * 3600 * 1000;

@Injectable()
export class EbarimtRegistryService {
  private readonly logger = new Logger(EbarimtRegistryService.name);
  private districtCache: { list: EbarimtDistrict[]; at: number } | null = null;

  /** ААН: 7–10 оронтой тоо · Иргэн: 2 кирилл + 8 тоо (УБ00112233). */
  static isValidRegNo(regNo: string): boolean {
    return /^([0-9]{7,10}|[А-ЯЁӨҮ]{2}[0-9]{8})$/u.test(regNo.trim());
  }

  private async get(path: string): Promise<any | null> {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e: any) {
      this.logger.warn(`ebarimt registry ${path} failed: ${e?.message}`);
      return null;
    }
  }

  /** Регистрийн дугаараар ТТД (merchantTin) + байгууллагын нэрийг авна. */
  async lookup(regNoRaw: string): Promise<EbarimtRegistryInfo> {
    const regNo = regNoRaw.trim();
    const tinInfo = await this.get(`/getTinInfo?regNo=${encodeURIComponent(regNo)}`);
    // Хариу нь {data: "<ТТД>"} хэлбэртэй; бусад хувилбарыг мөн тэвчинэ.
    const tin = firstString(tinInfo?.data, tinInfo?.data?.tin, tinInfo?.tin);

    // getInfo нь ?tin= авдаг; ТТД олдоогүй үед regNo-гоор нэг оролдоно.
    const sources = tin
      ? [`/getInfo?tin=${encodeURIComponent(tin)}`, `/getInfo?regNo=${encodeURIComponent(regNo)}`]
      : [`/getInfo?regNo=${encodeURIComponent(regNo)}`];

    const empty = { vatPayer: null, vatFreeProject: null, cityPayer: null, vatPayerSince: null };
    for (const path of sources) {
      const info = await this.get(path);
      const d = info?.data ?? info;
      const name = firstString(d?.name, typeof info?.data === 'string' ? info.data : null, info?.name);
      if (!name) continue;
      return {
        regNo,
        tin,
        name,
        found: true,
        vatPayer: bool(d?.vatPayer),
        vatFreeProject: bool(d?.freeProject),
        cityPayer: bool(d?.cityPayer),
        vatPayerSince: firstString(d?.vatpayerRegisteredDate),
      };
    }
    return { regNo, tin, name: null, found: Boolean(tin), ...empty };
  }

  /**
   * getBranchInfo — districtCode-ийн лавлах (аймаг/дүүрэг + сум/хороо).
   * Жишээ: Архангай(01) + Чулуут(02) → «0102». Өдөрт нэг л удаа татна.
   */
  async districts(): Promise<EbarimtDistrict[]> {
    if (this.districtCache && Date.now() - this.districtCache.at < DISTRICT_TTL_MS) {
      return this.districtCache.list;
    }
    const body = await this.get('/getBranchInfo');
    // data нь ихэвчлэн массив; ганц бичлэг үед объект байх боломжтой.
    const raw = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : [];
    const list: EbarimtDistrict[] = [];
    for (const row of raw) {
      const branchCode = firstString(row?.branchCode);
      const subBranchCode = firstString(row?.subBranchCode);
      if (!branchCode || !subBranchCode) continue;
      const branchName = firstString(row?.branchName) ?? '';
      const subBranchName = firstString(row?.subBranchName) ?? '';
      list.push({
        code: `${branchCode.padStart(2, '0')}${subBranchCode.padStart(2, '0')}`,
        label: [branchName, subBranchName].filter(Boolean).join(' — '),
        branchName,
        subBranchName,
      });
    }
    list.sort((a, b) => a.code.localeCompare(b.code));
    // Хоосон хариуг кэшлэхгүй — дараагийн оролдлого дахин татна.
    if (list.length > 0) this.districtCache = { list, at: Date.now() };
    return list;
  }
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

/** Эхний утга бүхий мөрийг буцаана (тоо ирвэл мөр болгоно). */
function firstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
    if (typeof c === 'number' && Number.isFinite(c)) return String(c);
  }
  return null;
}
