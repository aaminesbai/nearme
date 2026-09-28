import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const environment = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1).optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(12),
    DEMO_MODE: z.enum(['true', 'false']).default('false'),
    CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:8082'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  })
  .parse(process.env);

if (environment.NODE_ENV === 'production') {
  if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
  if (environment.DATABASE_URL.includes('nearme_local_only'))
    throw new Error('The development database password cannot be used in production');
  if (environment.DEMO_MODE === 'true') throw new Error('DEMO_MODE must be false in production');
  if (!environment.CORS_ORIGINS.trim()) throw new Error('CORS_ORIGINS is required in production');
  for (const value of environment.CORS_ORIGINS.split(',').map((origin) => origin.trim())) {
    let origin: URL;
    try {
      origin = new URL(value);
    } catch {
      throw new Error(`Invalid CORS origin: ${value}`);
    }
    if (origin.protocol !== 'https:' || origin.hostname === 'localhost' || origin.hostname === '*')
      throw new Error('Production CORS origins must be explicit HTTPS origins');
  }
}

const databaseUrl =
  environment.DATABASE_URL ??
  'postgresql://nearme:nearme_local_only@localhost:55432/nearme?connect_timeout=5';
if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://'))
  throw new Error('DATABASE_URL must use the postgresql:// protocol');

export const config = {
  nodeEnv: environment.NODE_ENV,
  port: environment.PORT,
  databaseUrl,
  databasePoolMax: environment.DATABASE_POOL_MAX,
  demo: environment.DEMO_MODE === 'true' && environment.NODE_ENV !== 'production',
  origins: environment.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  trustProxyHops: environment.TRUST_PROXY_HOPS,
};
