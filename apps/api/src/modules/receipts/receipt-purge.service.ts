import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * lottery / qrData-ийн хадгалалтын хугацаа.
 *
 * ТЕГ-ийн заавар: «lottery болон qrData талбаруудын мэдээллийг төлбөрийн
 * баримтанд ХЭВЛЭХЭЭС өөрөөр ямар ч хэлбэрээр хадгалахыг хориглоно.»
 *
 * Төлөгч баримтаа хараад QR-аа уншуулах хангалттай хугацаа хэрэгтэй тул
 * бид тэдгээрийг ТҮР хадгалж, хугацаа дуусмагц баганыг NULL болгоно.
 * ДДТД (`receiptNo`) нь баримтын албан ёсны дугаар тул хэвээр үлдэнэ —
 * хориг зөвхөн сугалаа болон QR-т хамаарна.
 *
 * EBARIMT_QR_RETENTION_HOURS = 0 → хадгалахгүй (баримт үүсмэгц цэвэрлэнэ).
 */
const SWEEP_MS = 15 * 60 * 1000;

@Injectable()
export class ReceiptPurgeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReceiptPurgeService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Хэдэн цаг хадгалах вэ (default 72 цаг = 3 хоног). */
  get retentionHours(): number {
    const raw = Number(this.config.get('EBARIMT_QR_RETENTION_HOURS'));
    return Number.isFinite(raw) && raw >= 0 ? raw : 72;
  }

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.error(e?.message)), SWEEP_MS);
    // Асаад шууд биш — эхлэлийн ачааллыг бусад ажилтай давхцуулахгүй.
    setTimeout(() => void this.sweep().catch((e) => this.logger.error(e?.message)), 90_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Хугацаа хэтэрсэн баримтуудын сугалаа/QR-ийг NULL болгоно. */
  async sweep(): Promise<{ purged: number }> {
    const cutoff = new Date(Date.now() - this.retentionHours * 3600 * 1000);
    const res = await this.prisma.ebarimtReceipt.updateMany({
      where: {
        createdAt: { lt: cutoff },
        OR: [{ lottery: { not: null } }, { qrData: { not: null } }],
      },
      data: { lottery: null, qrData: null },
    });
    if (res.count > 0) {
      this.logger.log(`Cleared lottery/QR on ${res.count} receipt(s) older than ${this.retentionHours}h`);
    }
    return { purged: res.count };
  }
}
