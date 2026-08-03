import { Body, Controller, Get, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { sha256 } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInvoiceDto } from '../invoices/invoices.dto';
import { InvoicesService } from '../invoices/invoices.service';

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
    (req as any).partner = { tenantId: key.tenantId, keyId: key.id, tenantName: key.tenant.name };
    return true;
  }
}

/**
 * Partner REST API (PRD §9.1 subset): create-and-send an invoice, read its
 * canonical state. ERP/CRM systems integrate here with a scoped API key.
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
  ) {}

  @Post('invoices')
  async create(@Req() req: Request, @Body() dto: CreateInvoiceDto) {
    const partner = (req as any).partner as { tenantId: string; keyId: string };
    const invoice = await this.invoices.create(
      { userId: `apikey:${partner.keyId}`, email: 'partner-api', name: 'Partner API', tenantId: partner.tenantId, role: 'OPERATOR', isAdmin: false },
      dto,
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
  }

  @Get('invoices/:id')
  async get(@Req() req: Request, @Param('id') id: string) {
    const partner = (req as any).partner as { tenantId: string };
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
}
