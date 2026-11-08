import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { PrismaModule, PrismaService } from './prisma/prisma.service.js';
import { StorageModule } from './storage/storage.service.js';
import { AuditModule } from './audit/audit.service.js';
import { RealtimeModule } from './realtime/realtime.gateway.js';
import { NotificationsModule } from './notifications/notifications.js';
import { PlansModule } from './plans/plans.js';
import { AuthModule } from './auth/auth.js';
import { OrganizersModule } from './organizers/organizers.js';
import { CatalogModule } from './catalog/catalog.js';
import { TournamentsModule } from './tournaments/tournaments.module.js';
import { TeamsModule } from './teams/teams.js';
import { DashboardModule } from './dashboard/dashboard.js';
import { MatchesModule } from './matches/matches.js';
import { PlayersModule } from './players/players.js';
import { JwtAuthGuard, RolesGuard } from './common/guards/auth.guards.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { Public } from './common/decorators/auth.decorators.js';
import { env } from './config/env.js';

@ApiTags('Salud')
@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }], skipIf: () => env.isTest }),
    PrismaModule,
    StorageModule,
    AuditModule,
    RealtimeModule,
    NotificationsModule,
    PlansModule,
    AuthModule,
    OrganizersModule,
    CatalogModule,
    TournamentsModule,
    MatchesModule,
    PlayersModule,
    TeamsModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
