-- Up Migration
CREATE TABLE inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  medicine_id uuid NOT NULL REFERENCES medicines(id),
  price_etb numeric(10,2) NOT NULL CHECK (price_etb >= 0),
  qty_on_hand int NOT NULL CHECK (qty_on_hand >= 0),
  qty_reserved int NOT NULL DEFAULT 0 CHECK (qty_reserved >= 0),
  expiry_date date NOT NULL,
  is_out_of_stock boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pharmacy_id, medicine_id),
  CHECK (qty_reserved <= qty_on_hand)
);

-- Searches look up "who has medicine X in stock", so index by medicine
CREATE INDEX inventory_medicine_idx ON inventory (medicine_id)
  WHERE NOT is_out_of_stock;

-- Down Migration
DROP TABLE inventory;