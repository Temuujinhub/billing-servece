import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthUser, CurrentUser, Public } from '../../common/decorators';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // ---- payer-facing public endpoints (short-link token IS the credential)

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('public/pay/:token')
  resolve(@Param('token') token: string) {
    return this.payments.resolveToken(token);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('public/pay/:token/intent')
  createIntent(@Param('token') token: string) {
    return this.payments.createIntentForToken(token);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('public/pay/:token/status')
  status(@Param('token') token: string) {
    return this.payments.checkToken(token);
  }

  /** Sandbox-only "би төлсөн" simulation — disabled when PAYMENT_SANDBOX=false. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('public/pay/:token/simulate')
  simulate(@Param('token') token: string) {
    return this.payments.simulatePayment(token);
  }

  // ---- QPay V2 GET callback: must answer HTTP 200 body "SUCCESS" (spec).
  //      Treated only as a trigger — truth comes from /v2/payment/check.

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('webhooks/qpay/callback')
  qpayCallback(@Query('intent') intent?: string) {
    return this.payments.handleQpayCallback(intent);
  }

  // ---- legacy HMAC-signed webhook (mock/internal)

  @Public()
  @HttpCode(200)
  @Post('webhooks/qpay')
  webhook(
    @Req() req: Request,
    @Headers('x-signature') signature: string | undefined,
    @Body() body: { providerInvoiceId?: string },
  ) {
    return this.payments.webhook((req as any).rawBody, signature, body);
  }

  // ---- merchant dashboard

  @ApiBearerAuth()
  @Get('payments')
  list(@CurrentUser() user: AuthUser, @Query('take') take?: number, @Query('skip') skip?: number) {
    return this.payments.list(user.tenantId, take ?? 50, skip ?? 0);
  }
}
