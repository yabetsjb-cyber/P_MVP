-- Up Migration
CREATE TABLE catalog_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  brand_name text NOT NULL,
  generic_name text NOT NULL,
  strength text NOT NULL,
  dosage_form text,
  pack_size text NOT NULL,
  suggested_rx_status text CHECK (suggested_rx_status IN ('RX','OTC')),
  match_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','merged','rejected')),
  medicine_id uuid REFERENCES medicines(id),
  admin_note text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  source_import_id uuid REFERENCES imports(id),
  source_row int,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- approved/merged must point at a medicine; pending/rejected must not
  CHECK ((status IN ('approved','merged')) = (medicine_id IS NOT NULL))
);

-- One pending request per pharmacy per product
CREATE UNIQUE INDEX catalog_requests_one_pending
  ON catalog_requests (pharmacy_id, match_key) WHERE status = 'pending';
CREATE INDEX catalog_requests_queue_idx ON catalog_requests (status, created_at);
CREATE INDEX catalog_requests_key_idx ON catalog_requests (match_key);

-- Other spellings that should resolve to a catalog medicine
CREATE TABLE medicine_aliases (
  match_key text PRIMARY KEY,
  medicine_id uuid NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  created_from_request uuid REFERENCES catalog_requests(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX medicine_aliases_medicine_idx ON medicine_aliases (medicine_id);

-- Down Migration
DROP TABLE medicine_aliases;
DROP TABLE catalog_requests;