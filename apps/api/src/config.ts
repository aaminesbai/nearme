import 'dotenv/config';
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgresql://nearme:nearme_local_only@localhost:55432/nearme',
  demo: process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production',
  origins: (process.env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:8082').split(','),
};
if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL)
  throw new Error('DATABASE_URL is required in production');
