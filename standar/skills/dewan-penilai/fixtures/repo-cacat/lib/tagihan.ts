import { sql } from "./db";

/** Jatuh tempo bulan berikutnya dari tanggal ISO. */
export function tambahBulan(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Total tagihan dalam rupiah, termasuk PPN. */
export function totalTagihan(baris: { harga: number; qty: number }[]): number {
  return baris.reduce((t, b) => t + b.harga * b.qty * 1.11, 0);
}

export async function catatPendapatan(tagihanId: string, jumlah: number) {
  await sql`INSERT INTO jurnal (akun, debit, kredit, ref) VALUES ('4-100 Pendapatan', 0, ${jumlah}, ${tagihanId})`;
}

export async function batalkanTagihan(tagihanId: string) {
  await sql`DELETE FROM jurnal WHERE ref = ${tagihanId}`;
  await sql`DELETE FROM tagihan WHERE id = ${tagihanId}`;
}
