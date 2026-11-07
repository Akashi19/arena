import { BadRequestException, Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const DOCUMENT_TYPES: Record<string, string> = { ...IMAGE_TYPES, 'application/pdf': 'pdf' };

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/** Comprueba la firma binaria real del archivo (no confiar en el Content-Type del cliente). */
function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client = new S3Client({
    endpoint: env.s3.endpoint,
    region: env.s3.region,
    forcePathStyle: env.s3.forcePathStyle,
    credentials: { accessKeyId: env.s3.accessKey, secretAccessKey: env.s3.secretKey },
  });

  async onModuleInit() {
    if (env.isTest) return;
    for (const bucket of [env.s3.bucketPublic, env.s3.bucketPrivate]) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
          this.logger.log(`Bucket creado: ${bucket}`);
        } catch (err) {
          this.logger.warn(`No se pudo verificar/crear el bucket ${bucket}: ${(err as Error).message}`);
        }
      }
    }
  }

  /** Sube una imagen pública (logos, avatares, portadas, escudos) y devuelve su URL. */
  async uploadPublicImage(file: UploadedFileLike | undefined, folder: string): Promise<string> {
    const { mime, ext } = this.validate(file, IMAGE_TYPES, MAX_IMAGE_BYTES);
    const key = `${folder}/${randomUUID()}.${ext}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.s3.bucketPublic,
        Key: key,
        Body: file!.buffer,
        ContentType: mime,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${env.s3.publicUrl.replace(/\/$/, '')}/${env.s3.bucketPublic}/${key}`;
  }

  /** Sube un documento privado (verificación, evidencias). Devuelve la ruta interna, nunca una URL pública. */
  async uploadPrivateDocument(file: UploadedFileLike | undefined, folder: string): Promise<string> {
    const { mime, ext } = this.validate(file, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES);
    const key = `${folder}/${randomUUID()}.${ext}`;
    await this.client.send(
      new PutObjectCommand({ Bucket: env.s3.bucketPrivate, Key: key, Body: file!.buffer, ContentType: mime }),
    );
    return key;
  }

  /** URL temporal (por defecto 5 min) para revisar documentación privada. */
  async signedPrivateUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: env.s3.bucketPrivate, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async deletePrivate(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.s3.bucketPrivate, Key: key }));
  }

  /** Elimina un objeto público a partir de su URL (si pertenece a nuestro bucket). */
  async deletePublicByUrl(url: string | null | undefined) {
    if (!url) return;
    const prefix = `${env.s3.publicUrl.replace(/\/$/, '')}/${env.s3.bucketPublic}/`;
    if (!url.startsWith(prefix)) return;
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: env.s3.bucketPublic, Key: url.slice(prefix.length) }));
    } catch (err) {
      this.logger.warn(`No se pudo borrar ${url}: ${(err as Error).message}`);
    }
  }

  private validate(file: UploadedFileLike | undefined, allowed: Record<string, string>, maxBytes: number) {
    if (!file?.buffer?.length) throw new BadRequestException('Debes adjuntar un archivo');
    if (file.size > maxBytes) {
      throw new BadRequestException(`El archivo supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB`);
    }
    const mime = sniffMime(file.buffer);
    if (!mime || !allowed[mime]) throw new BadRequestException('Formato de archivo no permitido');
    return { mime, ext: allowed[mime] };
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
