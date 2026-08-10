import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ADMIN_KEY, AuthUser, ROLES_KEY } from '../decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;

    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (adminOnly) {
      if (user?.isAdmin) return true;
      throw new ForbiddenException({
        code: 'ADMIN_ONLY',
        message_mn: 'Энэ хэсэгт зөвхөн платформын админ хандана.',
        message_en: 'Platform admin access required.',
      });
    }

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    if (!user) return false;
    if (user.role === Role.OWNER) return true; // owner can do everything in-tenant
    if (required.includes(user.role)) return true;
    throw new ForbiddenException({
      code: 'FORBIDDEN_ROLE',
      message_mn: 'Таны эрх энэ үйлдлийг хийхэд хүрэлцэхгүй байна.',
      message_en: 'Your role is not allowed to perform this action.',
    });
  }
}
