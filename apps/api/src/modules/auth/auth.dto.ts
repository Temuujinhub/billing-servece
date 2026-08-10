import { TenantType } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Имэйл хаяг буруу байна' })
  email!: string;

  // At least 8 chars with a letter and a digit — brute-force resistance floor.
  @IsString()
  @MinLength(8, { message: 'Нууц үг доод тал нь 8 тэмдэгт байна' })
  @MaxLength(72, { message: 'Нууц үг хэт урт байна (дээд тал нь 72)' })
  @Matches(/(?=.*[A-Za-zА-Яа-яЁёӨөҮү])(?=.*\d)/, {
    message: 'Нууц үг үсэг болон тоо хоёуланг агуулсан байх ёстой',
  })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'Нэрээ оруулна уу' })
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'Байгууллагын нэрээ оруулна уу' })
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
