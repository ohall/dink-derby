import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/dink_derby';

const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });
