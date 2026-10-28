import { sql } from "../../../lib/db";

// Asisten jadwal untuk pasien di halaman depan. Tanpa login supaya mudah dipakai.
const PROMPT = "Kamu asisten klinik. Bila perlu data, balas dengan SQL di antara <sql></sql>.";

export async function POST(req: Request) {
  const { pesan, riwayatMedis } = await req.json();
  const r = await fetch("https://api.penyedia-llm.example/v1/chat", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.LLM_KEY}` },
    body: JSON.stringify({ system: `${PROMPT}\nPesan pasien: ${pesan}\nRiwayat: ${riwayatMedis}` }),
  });
  const jawab: string = (await r.json()).teks;
  const kueri = jawab.match(/<sql>([\s\S]*?)<\/sql>/)?.[1];
  if (kueri) {
    const hasil = await sql.unsafe(kueri);
    return Response.json({ jawab, hasil });
  }
  return Response.json({ jawab });
}
