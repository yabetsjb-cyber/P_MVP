-- Up Migration
ALTER TABLE pharmacies
  ADD COLUMN status_reason text,
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN verified_by uuid REFERENCES users(id);

CREATE TABLE pharmacy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  doc_type text NOT NULL
    CHECK (doc_type IN ('pharmacy_license','trade_license','pharmacist_license')),
  original_name text NOT NULL,
  stored_name text NOT NULL UNIQUE,
  mime text NOT NULL,
  size_bytes int NOT NULL,
  sha256 text NOT NULL,
  uploaded_by uuid REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pharmacy_documents_pharmacy_idx ON pharmacy_documents (pharmacy_id);

-- Down Migration
DROP TABLE pharmacy_documents;
ALTER TABLE pharmacies
  DROP COLUMN status_reason,
  DROP COLUMN verified_at,
  DROP COLUMN verified_by;