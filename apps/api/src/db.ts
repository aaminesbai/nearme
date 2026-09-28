import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient, type Prisma } from './generated/prisma/client';
import { config } from './config';
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.databasePoolMax,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10_000,
});
pool.on('error', (error) => console.error('Database connection error', error.message));
const adapter = new PrismaPg(pool, { disposeExternalPool: true });
export const prisma = new PrismaClient({ adapter, log: ['error'] });

export async function pairTransaction<T>(
  key: string,
  operation: (client: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS lock`;
      return operation(tx);
    },
    { maxWait: 5000, timeout: 15_000 },
  );
}
