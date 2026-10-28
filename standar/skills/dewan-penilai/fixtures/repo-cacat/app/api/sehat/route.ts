// Healthcheck untuk pemantau luar. Tidak membaca data apa pun.
export function GET() {
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
