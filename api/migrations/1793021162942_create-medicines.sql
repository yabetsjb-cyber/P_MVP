-- Up Migration
CREATE TABLE medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name text NOT NULL,
  generic_name text NOT NULL,
  strength text NOT NULL,
  dosage_form text,
  pack_size text NOT NULL,
  rx_status text NOT NULL CHECK (rx_status IN ('RX','OTC')),
  is_controlled boolean NOT NULL DEFAULT false,
  match_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigram index: powers typo-tolerant search ("amoxcilin" finds "Amoxicillin")
CREATE INDEX medicines_search_trgm ON medicines
  USING gin ((brand_name || ' ' || generic_name) gin_trgm_ops);

-- Down Migration
DROP TABLE medicines;