import pg from 'pg';
import { config } from './config';
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 12,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (error) => console.error('Database connection error', error.message));

export async function pairTransaction<T>(
  key: string,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize sends and blocks for the same pair, including concurrent requests.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
