import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

/** Traduce errores de Prisma a respuestas HTTP comprensibles sin filtrar detalles internos. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Prisma');

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    switch (exception.code) {
      case 'P2002':
        return res.status(HttpStatus.CONFLICT).json({
          statusCode: 409,
          message: 'Ya existe un registro con esos datos',
          fields: (exception.meta as { target?: unknown } | undefined)?.target,
        });
      case 'P2025':
        return res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Registro no encontrado' });
      case 'P2003':
        return res.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message: 'Referencia inválida' });
      default:
        this.logger.error(exception.message);
        return res
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json({ statusCode: 500, message: 'Error interno de base de datos' });
    }
  }
}
