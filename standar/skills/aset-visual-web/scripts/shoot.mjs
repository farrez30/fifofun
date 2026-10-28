// Tangkapan layar untuk tinjauan halaman, lewat Chrome DevTools Protocol (Node 22+, tanpa dependensi).
//
//   node shoot.mjs <url> <outDir> [--steps 760] [--eval "<js sebelum memotret>"]
//
// Menghasilkan: mobile.png (390x844 DPR 2), mobile-NN.png (bingkai bertahap dengan viewport TETAP,
// karena memperbesar viewport setinggi dokumen ikut membesarkan satuan vh dan merusak tangkapan),
// mobile-reduced-motion.png, desktop.png (1440x900). Ambil dari hasil build yang disajikan lewat http,
// bukan dev server (minifier bisa mengubah CSS) dan bukan file:// (path /img/... rusak).
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);
const [url, out] = args;
const opt = (name, def) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : def; };
const step = Number(opt("--steps", "760"));
const pre = opt("--eval", "");
if (!url || !out) { console.error("pakai: node shoot.mjs <url> <outDir> [--steps 760] [--eval js]"); process.exit(2); }
mkdirSync(out, { recursive: true });

const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9333 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "shoot-"))}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
for (let i = 0; i < 40 && !ws; i++) {
  try {
    const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch {}
  if (!ws) await sleep(250);
}
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(out, name), Buffer.from(r.result.data, "base64")); console.log("saved", name); };
const viewport = (w, h, mobile) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
const load = async () => { await send("Page.navigate", { url }); await sleep(2500); await js("document.documentElement.style.scrollBehavior='auto'; true"); if (pre) await js(pre); };

await send("Page.enable"); await send("Runtime.enable");

await viewport(390, 844, true); await load();
await shot("mobile.png");
const end = await js("document.documentElement.scrollHeight - innerHeight");
for (let y = 0, n = 1; ; y += step, n++) {
  const yy = Math.min(y, end);
  await js(`scrollTo(0, ${yy}); true`); await sleep(500);
  await shot(`mobile-${String(n).padStart(2, "0")}.png`);
  if (yy >= end) break;
}

await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await load(); await shot("mobile-reduced-motion.png");
await send("Emulation.setEmulatedMedia", { features: [] });

await viewport(1440, 900, false); await load();
await shot("desktop.png");

ws.close(); proc.kill(); process.exit(0);
