import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../../common/filters/http-exception.filter';
import { normalizeMnPhone } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './customers.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, search?: string, take = 50, skip = 0) {
    const where: Prisma.CustomerWhereInput = { tenantId };
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q.replace(/[\s\-]/g, '') } },
        { email: { contains: q, mode: 'insensitive' } },
        { externalRef: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(take, 200),
        skip,
        include: { _count: { select: { invoices: true } } },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total };
  }

  async get(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      include: {
        invoices: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: { select: { invoices: true } },
      },
    });
    if (!customer) {
      throw apiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', 'Харилцагч олдсонгүй.', 'Customer not found.');
    }
    return customer;
  }

  async create(tenantId: string, dto: CreateCustomerDto) {
    const phone = dto.phone ? normalizeMnPhone(dto.phone) : null;
    if (dto.phone && !phone) {
      throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_PHONE', 'Утасны дугаар буруу байна.', 'Invalid phone number.');
    }
    try {
      return await this.prisma.customer.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          phone,
          email: dto.email?.trim().toLowerCase() || null,
          externalRef: dto.externalRef?.trim() || null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw apiError(HttpStatus.CONFLICT, 'DUPLICATE_REF', 'Ийм дугаартай харилцагч бүртгэлтэй байна.', 'A customer with this reference already exists.');
      }
      throw e;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateCustomerDto) {
    await this.get(tenantId, id);
    const phone = dto.phone !== undefined ? (dto.phone ? normalizeMnPhone(dto.phone) : null) : undefined;
    if (dto.phone && phone === null) {
      throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_PHONE', 'Утасны дугаар буруу байна.', 'Invalid phone number.');
    }
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        phone,
        email: dto.email !== undefined ? dto.email?.trim().toLowerCase() || null : undefined,
        externalRef: dto.externalRef !== undefined ? dto.externalRef?.trim() || null : undefined,
      },
    });
  }

  /** Find-or-create used by the Excel import path (inside caller's transaction). */
  async upsertForImport(
    tx: Prisma.TransactionClient,
    tenantId: string,
    data: { name: string; phone: string | null; email: string | null; externalRef: string | null },
  ) {
    if (data.externalRef) {
      const existing = await tx.customer.findUnique({
        where: { tenantId_externalRef: { tenantId, externalRef: data.externalRef } },
      });
      if (existing) return existing;
    }
    if (data.phone) {
      const byPhone = await tx.customer.findFirst({ where: { tenantId, phone: data.phone } });
      if (byPhone) return byPhone;
    }
    return tx.customer.create({ data: { tenantId, ...data } });
  }
}
