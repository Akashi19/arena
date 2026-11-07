import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { env } from './config/env.js';

/** Configuración HTTP compartida por el servidor y las pruebas de integración. */
export function configureApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: env.corsOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta campos no declarados (no se puede, p.ej., auto-asignar insignias o planes)
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  return app;
}
