-- Up Migration
ALTER TABLE inventory DROP COLUMN price_etb;

-- Down Migration
ALTER TABLE inventory ADD COLUMN price_etb numeric(10,2) NOT NULL DEFAULT 0;