import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { apiError } from '../../common/filters/http-exception.filter';
import { sha256 } from '../../common/utils';
import { PrismaService } from '../../prisma/prisma.service';

export const API_SCOPES = ['invoice', 'receipt', 'pos'] as const;

class CreateKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  /** Эрхийн хүрээ: invoice (Үйлчилгээ 2), receipt (Үйлчилгээ 3), pos (Үйлчилгээ 4).
   *  Хоосон бол бүх эрхтэй (хуучин түлхүүрүүдтэй ижил). */
  @IsOptional()
  @IsArray()
  @IsIn(API_SCOPES as unknown as string[], { each: true })
  scopes?: string[];

  /** test түлхүүр юу ч бичихгүй — зөвхөн симуляц хариу (Postman-аар турших). */
  @IsOptional()
  @IsIn(['live', 'test'])
  mode?: 'live' | 'test';
}

class CreateWebhookDto {
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  @MaxLength(300)
  url!: string;

  @IsOptional()
  @IsArray()
  events?: string[];
}

/** Developer console (M-22): API keys + outbound webhooks — OWNER only. */
@ApiTags('developers')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('developers')
export class DevelopersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async overview(@CurrentUser() user: AuthUser) {
    const [keys, webhooks] = await Promise.all([
      this.prisma.apiKey.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, prefix: true, last4: true, scopes: true, mode: true, createdAt: true, revokedAt: true },
      }),
      this.prisma.webhookEndpoint.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, url: true, events: true, active: true, lastStatus: true, lastAt: true, createdAt: true },
      }),
    ]);
    return { keys, webhooks };
  }

  /** Full key is returned ONCE — only its hash is stored (PRD §9.2). */
  @Post('keys')
  async createKey(@CurrentUser() user: AuthUser, @Body() dto: CreateKeyDto) {
    const active = await this.prisma.apiKey.count({ where: { tenantId: user.tenantId, revokedAt: null } });
    if (active >= 5) {
      throw apiError(HttpStatus.BAD_REQUEST, 'TOO_MANY_KEYS', 'Идэвхтэй түлхүүр дээд тал нь 5 байна.', 'At most 5 active keys.');
    }
    const raw = `bsk_${dto.mode === 'test' ? 'test_' : ''}${randomBytes(24).toString('base64url')}`;
    const key = await this.prisma.apiKey.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name.trim(),
        prefix: raw.slice(0, dto.mode === 'test' ? 13 : 8),
        keyHash: sha256(raw),
        last4: raw.slice(-4),
        scopes: (dto.scopes ?? []) as any,
        mode: dto.mode ?? 'live',
      },
      select: { id: true, name: true, prefix: true, last4: true, scopes: true, mode: true, createdAt: true, revokedAt: true },
    });
    await this.prisma.auditLog.create({
      data: { tenantId: user.tenantId, actorId: user.userId, actorEmail: user.email, action: 'apikey.created', targetType: 'apikey', targetId: key.id },
    });
    return { key, secret: raw };
  }

  @HttpCode(200)
  @Delete('keys/:id')
  async revokeKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const updated = await this.prisma.apiKey.updateMany({
      where: { id, tenantId: user.tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (updated.count === 0) throw apiError(HttpStatus.NOT_FOUND, 'KEY_NOT_FOUND', 'Түлхүүр олдсонгүй.', 'Key not found.');
    await this.prisma.auditLog.create({
      data: { tenantId: user.tenantId, actorId: user.userId, actorEmail: user.email, action: 'apikey.revoked', targetType: 'apikey', targetId: id },
    });
    return { ok: true };
  }

  /** Webhook signing secret is returned ONCE at creation. */
  @Post('webhooks')
  async createWebhook(@CurrentUser() user: AuthUser, @Body() dto: CreateWebhookDto) {
    const count = await this.prisma.webhookEndpoint.count({ where: { tenantId: user.tenantId } });
    if (count >= 5) {
      throw apiError(HttpStatus.BAD_REQUEST, 'TOO_MANY_WEBHOOKS', 'Дээд тал нь 5 endpoint.', 'At most 5 endpoints.');
    }
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        tenantId: user.tenantId,
        url: dto.url.trim(),
        secret,
        events: (dto.events?.length ? dto.events : ['payment.succeeded', 'receipt.created']) as any,
      },
      select: { id: true, url: true, events: true, active: true, createdAt: true, lastStatus: true, lastAt: true },
    });
    await this.prisma.auditLog.create({
      data: { tenantId: user.tenantId, actorId: user.userId, actorEmail: user.email, action: 'webhook.created', targetType: 'webhook', targetId: endpoint.id },
    });
    return { endpoint, secret };
  }

  @HttpCode(200)
  @Delete('webhooks/:id')
  async deleteWebhook(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const deleted = await this.prisma.webhookEndpoint.deleteMany({ where: { id, tenantId: user.tenantId } });
    if (deleted.count === 0) throw apiError(HttpStatus.NOT_FOUND, 'WEBHOOK_NOT_FOUND', 'Endpoint олдсонгүй.', 'Endpoint not found.');
    await this.prisma.auditLog.create({
      data: { tenantId: user.tenantId, actorId: user.userId, actorEmail: user.email, action: 'webhook.deleted', targetType: 'webhook', targetId: id },
    });
    return { ok: true };
  }
}
