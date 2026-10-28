-- 0001 awal. Sudah dijalankan di produksi 2026-08-01.
CREATE TABLE pasien (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL,
  hp text,
  nik text,
  alergi text,
  dibuat timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE janji (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pasien_id uuid,
  waktu timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'baru'
);
