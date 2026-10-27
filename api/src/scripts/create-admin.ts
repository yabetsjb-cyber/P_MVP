import argon2 from 'argon2';
import { pool } from '../db';

const [email, password, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(' ') || 'Platform Admin';

async function main() {
  if (!email || !password || password.length < 10) {
    console.error('Usage: npm run create-admin -- <email> <password, 10+ chars> [Full Name]');
    process.exit(1);
  }
  const hash = await argon2.hash(password);
  const { rowCount } = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES (lower($1), $2, $3, 'platform_admin')
     ON CONFLICT DO NOTHING`,
    [email, hash, fullName]
  );
  console.log(rowCount ? `Admin created: ${email}` : `An account with ${email} already exists`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
