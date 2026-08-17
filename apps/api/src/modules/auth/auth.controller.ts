import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser, CurrentUser, Public } from '../../common/decorators';
import { AuthService } from './auth.service';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto } from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    // trust proxy=1 (main.ts) тул req.ip нь Caddy-гийн цаадах бодит IP.
    return this.auth.login(dto, req.ip);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  logout(@Body() dto: Partial<RefreshDto>) {
    return this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    return this.auth.changePassword(user, dto, req.ip);
  }

  // SMS сэргээх код — 15 минутад 3 хүсэлт (код spam + SMS зардлын хамгаалалт).
  @Public()
  @Throttle({ default: { limit: 3, ttl: 900_000 } })
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.forgotPassword(dto.email, req.ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto, req.ip);
  }
}
