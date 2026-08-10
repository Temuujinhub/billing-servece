import { InvoiceState } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const MAX_INVOICE_AMOUNT = 1_000_000_000; // 1 тэрбум ₮ hard cap

export class CreateInvoiceDto {
  /** Either an existing customer id … */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** … or inline payer details (name + phone) to create/find one. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsInt()
  @Min(1)
  @Max(MAX_INVOICE_AMOUNT)
  @Type(() => Number)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  description!: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  /** Send immediately after creating (default true from the UI). */
  @IsOptional()
  @IsBoolean()
  send?: boolean;

  /** Create an eBarimt receipt after payment (default true; module must be on). */
  @IsOptional()
  @IsBoolean()
  ebarimt?: boolean;
}

export class ListInvoicesDto {
  @IsOptional()
  @IsEnum(InvoiceState)
  state?: InvoiceState;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  take?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  skip?: number;
}
