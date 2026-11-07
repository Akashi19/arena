import {
  Controller,
  Get,
  Global,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { AuthUser, CurrentUser } from '../common/decorators/auth.decorators.js';
import { paginate, PaginationQuery } from '../common/utils/index.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Crea notificaciones dentro de la plataforma respetando preferencias del usuario
   * y las empuja por WebSocket. El canal email/WhatsApp queda preparado vía preferencias
   * (`notification_preferences`) para un worker de envío.
   */
  async notify(inputs: NotifyInput | NotifyInput[]) {
    const list = Array.isArray(inputs) ? inputs : [inputs];
    if (!list.length) return;
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { OR: list.map((i) => ({ userId: i.userId, type: i.type })) },
    });
    const muted = new Set(prefs.filter((p) => !p.inApp).map((p) => `${p.userId}:${p.type}`));
    const toSend = list.filter((i) => !muted.has(`${i.userId}:${i.type}`));
    for (const n of toSend) {
      const created = await this.prisma.notification.create({ data: n });
      this.realtime.emitToUser(n.userId, 'notification', created);
    }
  }

  async list(userId: string, q: PaginationQuery, unreadOnly: boolean) {
    const where: Prisma.NotificationWhereInput = { userId, ...(unreadOnly ? { readAt: null } : {}) };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { ...paginate(items, total, q.page, q.pageSize), unread };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}

@ApiTags('Notificaciones')
@ApiBearerAuth()
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: PaginationQuery, @Query('unread') unread?: string) {
    return this.service.list(user.id, q, unread === 'true');
  }

  @Patch(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead(user.id, id);
  }

  @Post('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.id);
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
