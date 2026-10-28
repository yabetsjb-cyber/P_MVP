-- Up Migration
CREATE TABLE imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  filename text NOT NULL,
  file_sha256 text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('update','sync')),
  status text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed','committed')),
  total_rows int NOT NULL,
  ok_rows int NOT NULL,
  error_rows int NOT NULL,
  unmatched_rows int NOT NULL,
  products_to_update int NOT NULL,
  products_to_zero int NOT NULL DEFAULT 0,
  ignored_columns text[] NOT NULL DEFAULT '{}',
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);
CREATE INDEX imports_pharmacy_idx ON imports (pharmacy_id, created_at DESC);

CREATE TABLE import_rows (
  id bigserial PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_number int NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','error','unmatched')),
  raw jsonb NOT NULL,
  errors jsonb NOT NULL DEFAULT '[]',
  warnings jsonb NOT NULL DEFAULT '[]',
  medicine_id uuid REFERENCES medicines(id),
  quantity int,
  expiry_date date,
  suggestions jsonb
);
CREATE INDEX import_rows_import_idx ON import_rows (import_id, status, row_number);

-- Down Migration
DROP TABLE import_rows;
DROP TABLE imports;