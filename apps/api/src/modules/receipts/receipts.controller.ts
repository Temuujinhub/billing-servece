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
    return this.receipts.list(user.tenantId, take ?? 50, skip ?? 0);
  }

  @Roles(Role.ACCOUNTANT, Role.OPERATOR)
  @HttpCode(200)
  @Post(':id/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.receipts.retry(user.tenantId, id);
  }
}
