import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.analytics.dashboard(user.tenantId);
  }
}
