// api/scripts/check-users.mjs
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rows } = await pool.query(`
    SELECT
      u.id,
      u.email,
      u.role,
      u.is_active,
      u.pharmacy_id,
      p.name  AS pharmacy_name,
      p.status AS pharmacy_status,
      p.license_expires_on
    FROM users u
    LEFT JOIN pharmacies p ON p.id = u.pharmacy_id
    ORDER BY u.email
  `);
  console.table(rows);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}