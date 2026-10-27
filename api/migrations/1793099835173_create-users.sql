-- Up Migration
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  phone text,
  role text NOT NULL
    CHECK (role IN ('pharmacy_owner','pharmacy_staff','platform_admin')),
  pharmacy_id uuid REFERENCES pharmacies(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role <> 'platform_admin' OR pharmacy_id IS NULL)
);

-- Emails are unique ignoring upper/lower case
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
CREATE INDEX users_pharmacy_idx ON users (pharmacy_id);

-- Down Migration
DROP TABLE users;