import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('live')
  live() {
    return {
      status: 'ok',
      service: 'billingservice-api',
      // Deployed git SHA (deploy workflow → DEPLOY_SHA) — deploy бүрийг
      // "яг энэ commit энэ сервер дээр ажиллаж байна" гэж нотлох гэрч.
      commit: process.env.DEPLOY_SHA || null,
      ts: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        await this.prisma.$queryRaw`SELECT 1`;
        return { database: { status: 'up' } };
      },
    ]);
  }
}
