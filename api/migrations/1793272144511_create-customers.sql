-- Up Migration
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,                       -- null for Google/Apple accounts later
  full_name text NOT NULL,
  phone text,                               -- optional, NOT verified
  auth_provider text NOT NULL DEFAULT 'password'
    CHECK (auth_provider IN ('password','google','apple','deleted')),
  provider_sub text,
  is_active boolean NOT NULL DEFAULT true,
  no_show_count int NOT NULL DEFAULT 0,
  suspended_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (auth_provider <> 'password' OR password_hash IS NOT NULL)
);
CREATE UNIQUE INDEX customers_email_unique ON customers (lower(email));
CREATE UNIQUE INDEX customers_provider_unique ON customers (auth_provider, provider_sub)
  WHERE provider_sub IS NOT NULL;

CREATE TABLE customer_sessions (
  token_hash text PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  device_name text,
  ip text,
  user_agent text
);
CREATE INDEX customer_sessions_customer_idx ON customer_sessions (customer_id);
CREATE INDEX customer_sessions_expires_idx ON customer_sessions (expires_at);

-- Down Migration
DROP TABLE customer_sessions;
DROP TABLE customers;