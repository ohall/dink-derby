import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL
  || (process.env.NODE_ENV === 'production' ? undefined : 'postgres://user:password@localhost:5432/dink_derby');
if (!connectionString) throw new Error('DATABASE_URL is required in production.');

const pool = new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX || 3),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });
export const databasePool = pool;
