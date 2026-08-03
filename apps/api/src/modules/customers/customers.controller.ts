import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, Roles, AuthUser } from '../../common/decorators';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './customers.dto';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('take') take?: number,
    @Query('skip') skip?: number,
  ) {
    return this.customers.list(user.tenantId, search, take ?? 50, skip ?? 0);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customers.get(user.tenantId, id);
  }

  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customers.create(user.tenantId, dto);
  }

  @Roles(Role.OPERATOR, Role.ACCOUNTANT)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(user.tenantId, id, dto);
  }
}
