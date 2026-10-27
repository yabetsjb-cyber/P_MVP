-- Up Migration
CREATE TABLE pharmacies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  license_no text NOT NULL UNIQUE,
  license_expires_on date,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','suspended','rejected')),
  phone text NOT NULL,
  address text,
  subcity text,
  location geography(Point, 4326) NOT NULL,
  opening_hours jsonb,
  last_inventory_update timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A GiST index makes "within X meters" queries fast.
CREATE INDEX pharmacies_location_gix ON pharmacies USING gist (location);

-- Down Migration
DROP TABLE pharmacies;