import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const med = await pool.query(`
    SELECT m.id AS medicine_id, m.rx_status,
           i.id AS inventory_id, i.pharmacy_id
      FROM medicines m
      JOIN inventory i ON i.medicine_id = m.id
      JOIN pharmacies p ON p.id = i.pharmacy_id
     WHERE m.brand_name = 'Amoxil' AND p.name = 'Abeba Pharmacy'
     LIMIT 1
  `);

  if (!med.rows[0]) {
    console.error('No Amoxil in Abeba inventory');
    process.exit(1);
  }
  const { medicine_id, inventory_id, pharmacy_id, rx_status } = med.rows[0];

  let customer_id;
  const cust = await pool.query(
    "SELECT id FROM customers WHERE phone = '+251911234567' LIMIT 1",
  );
  if (cust.rows[0]) {
    customer_id = cust.rows[0].id;
    console.log('Found existing customer', customer_id);
  } else {
    const c = await pool.query(
      `INSERT INTO customers (email, password_hash, full_name, phone, auth_provider)
       VALUES ('test-buyer@example.com', 'x', 'Selam T.', '+251911234567', 'password')
       RETURNING id`,
    );
    customer_id = c.rows[0].id;
    console.log('Created customer', customer_id);
  }

  // Idempotent cleanup
  await pool.query(
    "DELETE FROM reservation_events WHERE reservation_id IN (SELECT id FROM reservations WHERE code = 'CONF01')",
  );
  await pool.query("DELETE FROM reservations WHERE code = 'CONF01'");

  const requiresPrescription = rx_status === 'RX';

  const r = await pool.query(
    `INSERT INTO reservations
       (code, customer_id, pharmacy_id, inventory_id, medicine_id, qty, status,
        requires_prescription, respond_by)
     VALUES ('CONF01', $1, $2, $3, $4, 2, 'requested', $5, now() + interval '15 minutes')
     RETURNING id, code, status, requires_prescription`,
    [customer_id, pharmacy_id, inventory_id, medicine_id, requiresPrescription],
  );

  await pool.query(
    "UPDATE inventory SET qty_reserved = qty_reserved + 2 WHERE id = $1",
    [inventory_id],
  );

  console.log('Seeded:', r.rows[0]);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}