import { cookies } from "next/headers";
import { sql } from "./db";

export type Sesi = { userId: string; peran: "admin" | "dokter" | "pasien" };

export async function ambilSesi(): Promise<Sesi | null> {
  const token = (await cookies()).get("sesi")?.value;
  if (!token) return null;
  const [s] = await sql`SELECT user_id AS "userId", peran FROM sesi WHERE token_hash = encode(sha256(${token}::bytea), 'hex') AND kedaluwarsa > now()`;
  return (s as Sesi) ?? null;
}
