import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/** Claims embedded in the access token at login. */
export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  role: Role;
  /** Platform-operator flag — unlocks the /admin area. */
  isAdmin: boolean;
  /** Партнёрын ажилтан (Bonum → 'BONUM', LIME → 'EBARIMT') — зөвхөн өөрт
   *  хамаарах бүртгэлийн хүсэлтүүдийг харж, хариу бөглөх эрхтэй. */
  partnerKind?: 'BONUM' | 'EBARIMT' | null;
}

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as reachable without a JWT (payment page, webhooks, auth). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ADMIN_KEY = 'adminOnly';
/** Restricts a route to platform admins (billingservice.mn operators). */
export const AdminOnly = () => SetMetadata(ADMIN_KEY, true);

export const ROLES_KEY = 'roles';
/** Restricts a route to the given tenant roles (OWNER always passes). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
