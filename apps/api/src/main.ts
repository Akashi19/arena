import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true, rawBody: true });
  configureApp(app);
  app.useBodyParser('json', { limit: '1mb' });

  const config = new DocumentBuilder()
    .setTitle('Arena Torneos API')
    .setDescription(
      'API REST de la plataforma de torneos deportivos y eSports. Autenticación JWT (Bearer). ' +
        'Tiempo real vía socket.io en el namespace /realtime.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: 'api/docs-json',
  });

  app.enableShutdownHooks();
  await app.listen(env.port);
  Logger.log(`API escuchando en http://localhost:${env.port}/api (docs en /api/docs)`, 'Bootstrap');
}

bootstrap();
