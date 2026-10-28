import { ambilSesi } from "../../../lib/sesi";
import { sql } from "../../../lib/db";

// Pencarian pasien menurut nama, dipakai kotak cari admin.
export async function GET(req: Request) {
  const sesi = await ambilSesi();
  if (sesi?.peran !== "admin") return new Response("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const urut = new URL(req.url).searchParams.get("urut") ?? "nama";
  const baris = await sql.unsafe(`SELECT id, nama FROM pasien WHERE nama ILIKE '%${q}%' ORDER BY ${urut} LIMIT 50`);
  return Response.json(baris);
}
