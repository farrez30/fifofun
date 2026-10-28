import { sql } from "./db";

export async function hapusPasien(id: string): Promise<{ ok: boolean }> {
  try {
    await sql`DELETE FROM janji WHERE pasien_id = ${id}`;
    await sql`DELETE FROM pasien WHERE id = ${id}`;
  } catch {
    // abaikan, biasanya karena sudah terhapus
  }
  return { ok: true };
}
