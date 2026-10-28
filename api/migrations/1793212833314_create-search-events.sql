-- Up Migration
CREATE TABLE search_events (
  id bigserial PRIMARY KEY,
  normalized_query text NOT NULL,
  matched_medicine_id uuid REFERENCES medicines(id) ON DELETE SET NULL,
  results_count int NOT NULL,        -- pharmacy listings returned
  restricted boolean NOT NULL DEFAULT false,
  radius_m int NOT NULL,
  geo_cell text NOT NULL,            -- lat,lng rounded to 2 decimals (about 1 km)
  session_hash text NOT NULL,        -- keyed hash that changes daily; cannot identify a person
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_events_created_idx ON search_events (created_at);
-- Speeds up the "known medicine, nobody has stock" report we'll build later
CREATE INDEX search_events_unmet_idx ON search_events (created_at, matched_medicine_id)
  WHERE results_count = 0 AND NOT restricted;

-- Down Migration
DROP TABLE search_events;