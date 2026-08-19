import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';

const SWEEP_MS = 10 * 60 * 1000; // 10 минут тутам

/**
 * Гацсан eBarimt баримтын автомат retry sweeper. Өмнө нь retry зөвхөн
 * дараагийн төлбөр эсвэл гар үйлдлээр өдөөгддөг байсан — API/POS үйлчилгээнд
 * (standalone баримт) энэ нь хангалтгүй тул PENDING/FAILED (retries<5)
 * баримтуудыг тогтмол дахин оролдоно. processOne нь claim-guarded тул
 * зэрэгцээ ажиллагаанд давхар баримт үүсэхгүй.
 */
@Injectable()
export class ReceiptRetryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReceiptRetryService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly receipts: ReceiptsService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.error(e?.message)), SWEEP_MS);
    setTimeout(() => void this.sweep().catch((e) => this.logger.error(e?.message)), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep() {
    const tenants = await this.receipts.tenantsWithPending();
    for (const tenantId of tenants) {
      const { processed } = await this.receipts.processPending(tenantId);
      if (processed > 0) this.logger.log(`eBarimt retry sweep: tenant ${tenantId} → ${processed} баримт үүслээ`);
      // Гацсан цуцлалтуудыг (CANCEL_PENDING) мөн дахин оролдоно (B-22).
      const cancelled = await this.receipts.processCancelPending(tenantId).catch(() => 0);
      if (cancelled > 0) this.logger.log(`eBarimt cancel sweep: tenant ${tenantId} → ${cancelled} оролдлого`);
    }
  }
}
