import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { ReceiptsService } from './receipts.service';

@ApiTags('receipts')
@ApiBearerAuth()
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('take') take?: number, @Query('skip') skip?: number) {
    return this.receipts.list(user.tenantId, Number(take) || 50, Number(skip) || 0);
  }

  /** POS API 3.0 бүртгэлийн шалгалт — /rest/info-г дамжуулж харуулна. */
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  @Get('provider-info')
  providerInfo() {
    return this.receipts.providerInfo();
  }

  @Roles(Role.ACCOUNTANT, Role.OPERATOR)
  @HttpCode(200)
  @Post(':id/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.receipts.retry(user.tenantId, id);
  }

  /**
   * Тохиргооны «Туршилтын баримт (10₮)» — интеграцээ (ТТД бүртгэл, POS,
   * instance) бодит баримтаар шалгана. Тарифт тооцогдохгүй (source=test).
   */
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  @HttpCode(200)
  @Post('test')
  async testReceipt(@CurrentUser() user: AuthUser) {
    const r = await this.receipts.createStandalone({
      tenantId: user.tenantId,
      source: 'test',
      amount: 10,
      description: 'Туршилтын баримт — msgbill.mn',
      paymentMethod: 'CASH',
    });
    return { id: r.id, state: r.state, receipt_no: r.receiptNo, lottery: r.lottery, error: r.error };
  }

  /** Баримт цуцлах (B-22) — ТЕГ рүү DELETE дамжуулна; эргэлт буцалтгүй тул OWNER/Нягтлан л. */
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.receipts.cancel(user.tenantId, id, { userId: user.userId, email: user.email });
  }
}
