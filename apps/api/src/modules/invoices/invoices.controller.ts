import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { CreateInvoiceDto, ListInvoicesDto } from './invoices.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() q: ListInvoicesDto) {
    await this.invoices.markOverdue(user.tenantId);
    return this.invoices.list(user.tenantId, q);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.get(user.tenantId, id);
  }

  @Roles(Role.OPERATOR)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(user, dto);
  }

  @Roles(Role.OPERATOR)
  @HttpCode(200)
  @Post(':id/send')
  send(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.send(user, id);
  }

  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.invoices.cancel(user, id, reason);
  }
}
