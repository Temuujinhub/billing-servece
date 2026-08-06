import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../decorators';

/** Gate for /admin/* — only platform staff (User.isPlatformAdmin) may pass. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (user?.isPlatformAdmin) return true;
    throw new ForbiddenException({
      code: 'PLATFORM_ADMIN_ONLY',
      message_mn: 'Энэ хуудас зөвхөн платформын админд зориулагдсан.',
      message_en: 'This area is restricted to platform administrators.',
    });
  }
}
