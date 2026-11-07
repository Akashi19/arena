import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable de entorno requerida no definida: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

const nodeEnv = optional('NODE_ENV', 'development');

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: Number(optional('PORT', '4100')),
  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:3100')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  publicWebUrl: optional('PUBLIC_WEB_URL', 'http://localhost:3100'),
  databaseUrl: required('DATABASE_URL'),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessTtl: optional('JWT_ACCESS_TTL', '15m'),
    refreshTtlDays: Number(optional('JWT_REFRESH_TTL_DAYS', '30')),
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || undefined,
    publicUrl: optional('S3_PUBLIC_URL', process.env.S3_ENDPOINT ?? ''),
    region: optional('S3_REGION', 'us-east-1'),
    accessKey: required('S3_ACCESS_KEY'),
    secretKey: required('S3_SECRET_KEY'),
    bucketPublic: optional('S3_BUCKET_PUBLIC', 'arena-public'),
    bucketPrivate: optional('S3_BUCKET_PRIVATE', 'arena-private'),
    forcePathStyle: optional('S3_FORCE_PATH_STYLE', 'true') === 'true',
  },
};

if (env.isProduction) {
  for (const secret of [env.jwt.accessSecret, env.jwt.refreshSecret]) {
    if (secret.length < 32 || secret.startsWith('change-me')) {
      throw new Error('Los secretos JWT de producción deben ser aleatorios y de al menos 32 caracteres');
    }
  }
}
