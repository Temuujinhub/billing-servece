import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../decorators';

/** Gate for /partner/* — partner staff (Bonum/LIME) or platform admins. */
@Injectable()
export class PartnerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (user?.isAdmin || user?.partnerKind) return true;
    throw new ForbiddenException({
      code: 'PARTNER_ONLY',
      message_mn: 'Энэ хуудас зөвхөн хамтрагч байгууллагын ажилтанд зориулагдсан.',
      message_en: 'This area is restricted to partner staff.',
    });
  }
}
