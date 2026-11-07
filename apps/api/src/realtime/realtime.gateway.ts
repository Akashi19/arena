import { Global, Logger, Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { env } from '../config/env.js';

/**
 * WebSockets (socket.io) para actualizaciones en tiempo real:
 *  - sala `user:{id}`        notificaciones personales (requiere JWT en handshake.auth.token)
 *  - sala `tournament:{id}`  cambios de inscripciones, resultados, horarios, streams (público)
 */
@WebSocketGateway({ cors: { origin: env.corsOrigins, credentials: true }, namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth as { token?: string } | undefined)?.token;
    if (!token) return;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ: string }>(token, {
        secret: env.jwt.accessSecret,
      });
      if (payload.typ === 'access') await client.join(`user:${payload.sub}`);
    } catch {
      this.logger.debug('Socket con token inválido: solo salas públicas');
    }
  }

  @SubscribeMessage('tournament:join')
  async joinTournament(@ConnectedSocket() client: Socket, @MessageBody() tournamentId: string) {
    if (typeof tournamentId === 'string' && /^[0-9a-f-]{36}$/i.test(tournamentId)) {
      await client.join(`tournament:${tournamentId}`);
    }
  }

  @SubscribeMessage('tournament:leave')
  async leaveTournament(@ConnectedSocket() client: Socket, @MessageBody() tournamentId: string) {
    if (typeof tournamentId === 'string') await client.leave(`tournament:${tournamentId}`);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server?.to(`user:${userId}`).emit(event, data);
  }

  emitToTournament(tournamentId: string, event: string, data: unknown) {
    this.server?.to(`tournament:${tournamentId}`).emit(event, data);
  }
}

@Global()
@Module({ providers: [RealtimeGateway, JwtService], exports: [RealtimeGateway] })
export class RealtimeModule {}
