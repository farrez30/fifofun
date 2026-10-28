import { ambilSesi } from "../../../../lib/sesi";
import { sql } from "../../../../lib/db";

// Detail pasien untuk halaman dokter.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sesi = await ambilSesi();
  if (!sesi) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const [pasien] = await sql`SELECT * FROM pasien WHERE id = ${id}`;
  if (!pasien) return new Response("Tidak ditemukan", { status: 404 });
  return Response.json(pasien);
}
