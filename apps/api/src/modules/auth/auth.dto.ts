import { TenantType } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  // At least 8 chars with a letter and a digit — brute-force resistance floor.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[A-Za-zА-Яа-яЁёӨөҮү])(?=.*\d)/, {
    message: 'Нууц үг үсэг болон тоо агуулсан байх ёстой',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  organizationName!: string;

  @IsOptional()
  @IsEnum(TenantType)
  tenantType?: TenantType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  regNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
