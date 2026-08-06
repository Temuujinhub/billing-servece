import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/** Claims embedded in the access token at login. */
export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  role: Role;
  /** Platform staff — sees ALL tenants' integration requests (/admin/*). */
  isPlatformAdmin?: boolean;
}

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as reachable without a JWT (payment page, webhooks, auth). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restricts a route to the given tenant roles (OWNER always passes). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
