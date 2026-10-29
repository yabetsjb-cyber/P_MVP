-- Up Migration
CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  inventory_id uuid NOT NULL REFERENCES inventory(id),
  medicine_id uuid NOT NULL REFERENCES medicines(id),
  qty int NOT NULL CHECK (qty BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','confirmed','fulfilled','declined','cancelled','expired')),
  requires_prescription boolean NOT NULL,
  respond_by timestamptz NOT NULL,        -- the pharmacy must answer before this
  pickup_by timestamptz,                  -- set when the pharmacy confirms
  confirmed_at timestamptz,
  fulfilled_at timestamptz,
  closed_at timestamptz,
  decline_reason text,
  closed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Active reservations are open; every finished one has a closing time
  CHECK ((status IN ('requested','confirmed')) = (closed_at IS NULL))
);

CREATE UNIQUE INDEX reservations_code_active ON reservations (pharmacy_id, code)
  WHERE status IN ('requested','confirmed');
CREATE UNIQUE INDEX reservations_one_per_item ON reservations (customer_id, inventory_id)
  WHERE status IN ('requested','confirmed');
CREATE INDEX reservations_customer_idx ON reservations (customer_id, created_at DESC);
CREATE INDEX reservations_pharmacy_active_idx ON reservations (pharmacy_id, created_at)
  WHERE status IN ('requested','confirmed');
CREATE INDEX reservations_respond_due_idx ON reservations (respond_by) WHERE status = 'requested';
CREATE INDEX reservations_pickup_due_idx ON reservations (pickup_by) WHERE status = 'confirmed';

CREATE TABLE reservation_events (
  id bigserial PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  status text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('customer','pharmacy','system')),
  actor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservation_events_res_idx ON reservation_events (reservation_id, id);

-- Down Migration
DROP TABLE reservation_events;
DROP TABLE reservations;