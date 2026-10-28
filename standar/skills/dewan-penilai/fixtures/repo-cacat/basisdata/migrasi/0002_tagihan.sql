-- 0002 tagihan dan jurnal.
CREATE TABLE tagihan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pasien_id uuid NOT NULL REFERENCES pasien (id),
  total numeric NOT NULL,
  status text NOT NULL DEFAULT 'terbit'
);

CREATE TABLE jurnal (
  id bigserial PRIMARY KEY,
  akun text NOT NULL,
  debit numeric NOT NULL DEFAULT 0,
  kredit numeric NOT NULL DEFAULT 0,
  ref uuid
);
