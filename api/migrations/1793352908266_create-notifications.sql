-- Up Migration
CREATE TABLE notifications (
  id bigserial PRIMARY KEY,
  recipient_type text NOT NULL CHECK (recipient_type IN ('customer','pharmacy')),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  pharmacy_id uuid REFERENCES pharmacies(id),
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((recipient_type = 'customer' AND customer_id IS NOT NULL AND pharmacy_id IS NULL)
      OR (recipient_type = 'pharmacy' AND pharmacy_id IS NOT NULL AND customer_id IS NULL))
);
CREATE INDEX notifications_customer_idx ON notifications (customer_id, id DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX notifications_customer_unread_idx ON notifications (customer_id)
  WHERE customer_id IS NOT NULL AND read_at IS NULL;
CREATE INDEX notifications_pharmacy_idx ON notifications (pharmacy_id, id DESC) WHERE pharmacy_id IS NOT NULL;

CREATE TABLE notification_deliveries (
  id bigserial PRIMARY KEY,
  notification_id bigint NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('push','telegram','sms')),
  target text NOT NULL,                       -- push token, or Telegram chat id
  payload jsonb NOT NULL,                     -- exactly what will be sent
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliveries_due_idx ON notification_deliveries (next_attempt_at) WHERE status = 'pending';

CREATE TABLE push_tokens (
  token text PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  session_token_hash text REFERENCES customer_sessions(token_hash) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android','ios')),
  device_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_customer_idx ON push_tokens (customer_id);

CREATE TABLE telegram_links (
  chat_id bigint PRIMARY KEY,
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  user_id uuid REFERENCES users(id),
  label text,
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_links_pharmacy_idx ON telegram_links (pharmacy_id);

CREATE TABLE telegram_link_tokens (
  token_hash text PRIMARY KEY,
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE telegram_link_tokens;
DROP TABLE telegram_links;
DROP TABLE push_tokens;
DROP TABLE notification_deliveries;
DROP TABLE notifications;