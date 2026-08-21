import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Request } from 'express';
import { Public } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { payLinkFor, sha256 } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { CreateInvoiceDto } from '../invoices/invoices.dto';
import { InvoicesService } from '../invoices/invoices.service';
import { ReceiptsService } from '../receipts/receipts.service';

export interface PartnerContext {
  tenantId: string;
  keyId: string;
  tenantName: string;
  scopes: string[];
  mode: 'live' | 'test';
}

/** Resolves `X-Api-Key` to a tenant context (PRD §9.2 scoped API keys). */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const raw = req.headers['x-api-key'];
    if (typeof raw !== 'string' || !raw.startsWith('bsk_')) {
      throw apiError(HttpStatus.UNAUTHORIZED, 'API_KEY_REQUIRED', 'X-Api-Key header шаардлагатай.', 'X-Api-Key header is required.');
    }
    const key = await this.prisma.apiKey.findUnique({ where: { keyHash: sha256(raw) }, include: { tenant: true } });
    if (!key || key.revokedAt || key.tenant.status !== 'ACTIVE') {
      throw apiError(HttpStatus.UNAUTHORIZED, 'API_KEY_INVALID', 'API түлхүүр хүчингүй байна.', 'Invalid or revoked API key.');
    }
    const scopes = Array.isArray(key.scopes) ? (key.scopes as string[]) : [];
    (req as any).partner = {
      tenantId: key.tenantId,
      keyId: key.id,
      tenantName: key.tenant.name,
      scopes,
      mode: key.mode === 'test' ? 'test' : 'live',
    } satisfies PartnerContext;
    return true;
  }
}

/** Хоосон scopes = бүх эрх (хуучин түлхүүрүүд); бусад үед жагсаалтад байх ёстой. */
function requireScope(partner: PartnerContext, scope: 'invoice' | 'receipt' | 'pos') {
  if (partner.scopes.length > 0 && !partner.scopes.includes(scope)) {
    throw apiError(
      HttpStatus.FORBIDDEN,
      'SCOPE_REQUIRED',
      `Энэ түлхүүрт '${scope}' эрх алга — Developers хуудаснаас шинэ түлхүүр үүсгэнэ үү.`,
      `This API key lacks the '${scope}' scope.`,
    );
  }
}

class CreateReceiptDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  description?: string;

  @IsOptional()
  @IsIn(['CITIZEN', 'ORGANIZATION'])
  receipt_type?: 'CITIZEN' | 'ORGANIZATION';

  /**
   * B2B баримтад төлөгч байгууллагын регистр (7 орон) ЭСВЭЛ ТТД (11-14 орон).
   * Регистр ирвэл баримт үүсгэхийн өмнө ТЕГ-ийн нээлттэй лавлагаагаар ТТД
   * болгож хөрвүүлнэ (POS API-ийн customerTin нь заавал ТТД).
   */
  @IsOptional()
  @IsString()
  @Matches(/^([0-9]{7,14}|[А-ЯЁӨҮ]{2}[0-9]{8})$/u, {
    message: 'payer_reg_no буруу форматтай — ААН-ийн регистр (7 орон), ТТД (11-14 орон) эсвэл иргэний регистр (АА00112233) байна.',
  })
  payer_reg_no?: string;

  @IsOptional()
  @IsIn(['CASH', 'CARD', 'BANK_TRANSFER'])
  payment_method?: 'CASH' | 'CARD' | 'BANK_TRANSFER';

  /** Үйлчилгээ 4 (POS): төхөөрөмжийн давтагдашгүй дугаар — байвал POS горим. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  device_id?: string;

  /** Терминалын хүний унших нэр (сонголт) — эхний баримтаар бүртгэгдэнэ. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  device_name?: string;
}

/**
 * Partner REST API (PRD §9.1 subset):
 *   • Үйлчилгээ 2 — нэхэмжлэх үүсгээд SMS илгээх (scope: invoice)
 *   • Үйлчилгээ 3 — eBarimt баримт шууд үүсгэх (scope: receipt)
 *   • Үйлчилгээ 4 — POS терминалын баримт, device_id-тэй (scope: pos)
 * Тест түлхүүр (mode=test) юу ч бичихгүй — валидаци хийгээд симуляц буцаана.
 */
@ApiTags('partner-api')
@Public()
@UseGuards(ApiKeyGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('partner')
export class PartnerApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly receipts: ReceiptsService,
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {}

  /** Idempotency-Key: ижил түлхүүр+ижил body → хадгалсан хариу; өөр body → 409. */
  private async withIdempotency<T>(
    partner: PartnerContext,
    idemKey: string | undefined,
    body: unknown,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!idemKey || partner.mode === 'test') return run();
    const key = `${partner.keyId}:${idemKey.slice(0, 100)}`;
    const requestHash = sha256(JSON.stringify(body ?? {}));
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { tenantId_key: { tenantId: partner.tenantId, key } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw apiError(HttpStatus.CONFLICT, 'IDEMPOTENCY_MISMATCH', 'Idempotency-Key өөр агуулгатай хүсэлтэд ашиглагдсан.', 'Idempotency key reused with different body.');
      }
      return existing.response as T;
    }
    const result = await run();
    await this.prisma.idempotencyKey
      .create({ data: { tenantId: partner.tenantId, key, requestHash, response: result as any } })
      .catch(() => undefined); // зэрэгцээ давхар хүсэлд unique зөрчил — хэвийн
    return result;
  }

  @Post('invoices')
  async create(
    @Req() req: Request,
    @Body() dto: CreateInvoiceDto,
    @Headers('idempotency-key') idemKey?: string,
  ) {
    const partner = (req as any).partner as PartnerContext;
    requireScope(partner, 'invoice');
    if (partner.mode === 'test') {
      // Симуляц: юу ч бичихгүй, бодит хэлбэртэй хариу (тест заавар docs/API_TESTING.md).
      return {
        id: `test_${sha256(JSON.stringify(dto)).slice(0, 24)}`,
        number: 'TEST-00001',
        amount: dto.amount,
        balance: dto.amount,
        state: 'SENT',
        pay_url: payLinkFor(this.config, 'TESTTOKEN'),
        created_at: new Date().toISOString(),
        test: true,
      };
    }
    return this.withIdempotency(partner, idemKey, dto, async () => {
      const invoice = await this.invoices.create(
        { userId: `apikey:${partner.keyId}`, email: 'partner-api', name: 'Partner API', tenantId: partner.tenantId, role: 'OPERATOR', isAdmin: false },
        dto,
        'api',
      );
      return {
        id: invoice.id,
        number: invoice.number,
        amount: invoice.amount,
        balance: invoice.balance,
        state: invoice.state,
        pay_url: (invoice as any).payUrl ?? null,
        created_at: invoice.createdAt,
      };
    });
  }

  @Get('invoices/:id')
  async get(@Req() req: Request, @Param('id') id: string) {
    const partner = (req as any).partner as PartnerContext;
    requireScope(partner, 'invoice');
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: partner.tenantId },
      include: {
        customer: { select: { name: true, phone: true } },
        intents: {
          where: { state: 'SUCCEEDED' },
          include: { transactions: { include: { receipts: { select: { state: true, receiptNo: true, lottery: true } } } } },
        },
      },
    });
    if (!invoice) {
      throw apiError(HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND', 'Нэхэмжлэх олдсонгүй.', 'Invoice not found.');
    }
    const receipt = invoice.intents.flatMap((i) => i.transactions).flatMap((t) => t.receipts)[0] ?? null;
    return {
      id: invoice.id,
      number: invoice.number,
      description: invoice.description,
      amount: invoice.amount,
      balance: invoice.balance,
      state: invoice.state,
      due_date: invoice.dueDate,
      paid_at: invoice.paidAt,
      customer: invoice.customer,
      receipt,
    };
  }

  /**
   * Үйлчилгээ 3/4: eBarimt баримт шууд үүсгэх. device_id байвал POS горим —
   * терминал автоматаар бүртгэгдэж тоологдоно (тоон хязгааргүй); үгүй бол
   * EBARIMT_API горим (сарын шатлалын хязгаар шалгагдана).
   */
  @Post('receipts')
  async createReceipt(
    @Req() req: Request,
    @Body() dto: CreateReceiptDto,
    @Headers('idempotency-key') idemKey?: string,
  ) {
    const partner = (req as any).partner as PartnerContext;
    const isPos = Boolean(dto.device_id);
    requireScope(partner, isPos ? 'pos' : 'receipt');

    if (partner.mode === 'test') {
      return {
        id: `test_${sha256(JSON.stringify(dto)).slice(0, 24)}`,
        state: 'CREATED',
        receipt_no: `TEST${Date.now() % 1_000_000_000}`,
        lottery: 'TEST-LOTTERY',
        qr_data: null,
        receipt_type: dto.receipt_type ?? 'CITIZEN',
        device_id: dto.device_id ?? null,
        test: true,
      };
    }

    const moduleCode = isPos ? 'POS_EBARIMT' : 'EBARIMT_API';
    const module = await this.prisma.tenantModule.findUnique({
      where: { tenantId_code: { tenantId: partner.tenantId, code: moduleCode } },
    });
    if (!module?.enabled) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'MODULE_DISABLED',
        isPos
          ? 'POS eBarimt үйлчилгээ идэвхгүй байна — Billing хуудаснаас идэвхжүүлнэ үү.'
          : 'eBarimt API үйлчилгээ идэвхгүй байна — Billing хуудаснаас идэвхжүүлнэ үү.',
        `Service module ${moduleCode} is disabled.`,
      );
    }

    return this.withIdempotency(partner, idemKey, dto, async () => {
      if (isPos) {
        await this.billing.touchTerminal(partner.tenantId, dto.device_id!, dto.device_name);
      } else {
        await this.billing.assertReceiptQuota(partner.tenantId);
      }
      const receipt = await this.receipts.createStandalone({
        tenantId: partner.tenantId,
        source: isPos ? 'pos' : 'api',
        amount: dto.amount,
        description: dto.description,
        receiptType: dto.receipt_type,
        payerRegNo: dto.payer_reg_no,
        deviceId: dto.device_id,
        paymentMethod: dto.payment_method,
      });
      return {
        id: receipt.id,
        state: receipt.state,
        receipt_no: receipt.receiptNo,
        lottery: receipt.lottery,
        qr_data: receipt.qrData,
        receipt_type: receipt.receiptType,
        device_id: receipt.deviceId,
        error: receipt.error,
      };
    });
  }

  /**
   * Баримт цуцлах (B-22): буцаалт/refund-ийн үед хүлээн авч ТЕГ рүү дамжуулна.
   * Идемпотент — аль хэдийн CANCELLED бол мөн л CANCELLED буцаана. Амжилтгүй
   * дамжуулалт CANCEL_PENDING төлөвт үлдэж 10 мин тутам автоматаар дахина.
   */
  @HttpCode(200)
  @Post('receipts/:id/cancel')
  async cancelReceipt(@Req() req: Request, @Param('id') id: string) {
    const partner = (req as any).partner as PartnerContext;
    if (partner.mode === 'test') {
      return { id, state: 'CANCELLED', test: true };
    }
    const found = await this.prisma.ebarimtReceipt.findFirst({
      where: { id, tenantId: partner.tenantId, source: { in: ['api', 'pos'] } },
      select: { source: true },
    });
    if (!found) {
      throw apiError(HttpStatus.NOT_FOUND, 'RECEIPT_NOT_FOUND', 'Баримт олдсонгүй.', 'Receipt not found.');
    }
    requireScope(partner, found.source === 'pos' ? 'pos' : 'receipt');
    const receipt = await this.receipts.cancel(partner.tenantId, id, { email: `apikey:${partner.keyId}` });
    return {
      id: receipt.id,
      state: receipt.state,
      receipt_no: receipt.receiptNo,
      error: receipt.error,
    };
  }

  @Get('receipts/:id')
  async getReceipt(@Req() req: Request, @Param('id') id: string) {
    const partner = (req as any).partner as PartnerContext;
    const receipt = await this.prisma.ebarimtReceipt.findFirst({
      where: { id, tenantId: partner.tenantId, source: { in: ['api', 'pos'] } },
    });
    if (!receipt) {
      throw apiError(HttpStatus.NOT_FOUND, 'RECEIPT_NOT_FOUND', 'Баримт олдсонгүй.', 'Receipt not found.');
    }
    requireScope(partner, receipt.source === 'pos' ? 'pos' : 'receipt');
    return {
      id: receipt.id,
      state: receipt.state,
      amount: receipt.amount,
      description: receipt.description,
      receipt_no: receipt.receiptNo,
      lottery: receipt.lottery,
      qr_data: receipt.qrData,
      receipt_type: receipt.receiptType,
      device_id: receipt.deviceId,
      error: receipt.error,
      created_at: receipt.createdAt,
    };
  }
}
