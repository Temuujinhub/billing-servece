import { TenantType } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Нууц үгийн бодлого (бүх нууц үг оруулах талбарт нэг мөр үйлчилнэ):
 * 8+ тэмдэгт, том үсэг, жижиг үсэг, тоо, тусгай тэмдэгт тус бүр 1+.
 * Кирилл том/жижиг үсгийг мөн хүлээн зөвшөөрнө. Web-ийн live чеклист
 * (password-policy.tsx) энэ дүрмийн толь — өөрчилбөл хоёуланг нь өөрчилнө.
 */
export const PASSWORD_POLICY_REGEX =
  /^(?=.*[a-zа-яёөү])(?=.*[A-ZА-ЯЁӨҮ])(?=.*\d)(?=.*[^A-Za-zА-Яа-яЁёӨөҮү0-9\s]).+$/;
export const PASSWORD_POLICY_MSG =
  'Нууц үг 8+ тэмдэгттэй бөгөөд том үсэг, жижиг үсэг, тоо, тусгай тэмдэгт (!@#$… г.м) тус бүр 1-ийг агуулсан байх ёстой';

/** Reusable password-field decorators (composition over inheritance). */
function passwordChecks() {
  return [
    IsString(),
    MinLength(8, { message: 'Нууц үг доод тал нь 8 тэмдэгт байна' }),
    MaxLength(72, { message: 'Нууц үг хэт урт байна (дээд тал нь 72)' }),
    Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MSG }),
  ];
}
function PasswordField(): PropertyDecorator {
  const decorators = passwordChecks();
  return (target, key) => decorators.forEach((d) => d(target, key));
}

export class RegisterDto {
  @IsEmail({}, { message: 'Имэйл хаяг буруу байна' })
  email!: string;

  @PasswordField()
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

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Одоогийн нууц үгээ оруулна уу' })
  currentPassword!: string;

  @PasswordField()
  newPassword!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Имэйл хаяг буруу байна' })
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail({}, { message: 'Имэйл хаяг буруу байна' })
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'Код 6 оронтой байна' })
  @Matches(/^\d{6}$/, { message: 'Код зөвхөн тооноос бүрдэнэ' })
  code!: string;

  @PasswordField()
  newPassword!: string;
}
