
import { config } from 'dotenv';

config();
import { Pool } from 'pg';

// A pool keeps several connections open and reuses them, which is much faster
// than opening a new connection for every request.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });