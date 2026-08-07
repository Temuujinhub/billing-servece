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
}

@Injectable()
export class EbarimtRegistryService {
  private readonly logger = new Logger(EbarimtRegistryService.name);

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

    let name: string | null = null;
    // getInfo нь ?tin= авдаг; ТТД олдоогүй үед regNo-гоор нэг оролдоно.
    const sources = tin
      ? [`/getInfo?tin=${encodeURIComponent(tin)}`, `/getInfo?regNo=${encodeURIComponent(regNo)}`]
      : [`/getInfo?regNo=${encodeURIComponent(regNo)}`];
    for (const path of sources) {
      const info = await this.get(path);
      const candidate =
        (typeof info?.name === 'string' && info.name) ||
        (typeof info?.data === 'string' && info.data) ||
        (typeof info?.data?.name === 'string' && info.data.name) ||
        '';
      if (candidate.trim()) {
        name = candidate.trim();
        break;
      }
    }
    return { regNo, tin, name, found: Boolean(tin || name) };
  }
}

/** Эхний утга бүхий мөрийг буцаана (тоо ирвэл мөр болгоно). */
function firstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
    if (typeof c === 'number' && Number.isFinite(c)) return String(c);
  }
  return null;
}
