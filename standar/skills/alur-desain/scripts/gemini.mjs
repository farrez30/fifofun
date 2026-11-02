// Gemini API langsung untuk model tier gratis yang tidak diterima pen.dev CLI (ADR 0055
// coderoach-app): teks (naskah, caption, variasi judul), suara (voice over TTS), dan
// transkrip rekaman. Node 22+, tanpa dependensi.
//
//   node gemini.mjs daftar
//   node gemini.mjs teks --model gemini-3-flash-preview --prompt "<instruksi>" [--lampiran brief.md ...] --keluar hasil.md
//   node gemini.mjs suara --model gemini-3.8-flash-tts --teks-file naskah.txt [--suara Kore] --keluar vo.wav
//   node gemini.mjs transkrip --model gemini-3.5-transcribe --audio rapat.mp3 [--petunjuk "<instruksi>"] --keluar transkrip.md
//
// `daftar` menunjukkan model yang dikenal key, bukan yang punya jatah gratis: jatahnya di
// references/anggaran-konten.md.
//   opsi umum: --pekerjaan "<isi kolom pekerjaan di log kuota>"
//
// Key dibaca dari berkas (CODEROACH_GEMINI_KEY, bawaannya gemini.key di sebelah pembungkus
// CODEROACH_PEN_CLI) dan dikirim di header, bukan di URL atau env. Setiap panggilan dicatat
// ke CODEROACH_KUOTA_LOG, termasuk yang gagal. Penolakan 429 tidak pernah diulang otomatis.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  AKAR_API, audioDari, barisLog, galatKuota, lajuDariMime, mimeAudio, pcmKeWav,
  permintaanSuara, permintaanTeks, permintaanTranskrip, ringkasRespons, tanpaKunci, teksDari, urai, waktuWib,
} from "./gemini-inti.mjs";

function berkasKunci() {
  if (process.env.CODEROACH_GEMINI_KEY) return process.env.CODEROACH_GEMINI_KEY;
  if (process.env.CODEROACH_PEN_CLI) return join(dirname(process.env.CODEROACH_PEN_CLI), "gemini.key");
  return join(homedir(), ".local", "pen-cli", "gemini.key");
}

function bacaKunci() {
  const path = berkasKunci();
  if (!existsSync(path)) throw new Error(`berkas key tidak ada di ${path}; pemilik mengisinya sendiri (perangkat-baru.md)`);
  const kunci = readFileSync(path, "utf8").trim();
  if (!kunci) throw new Error(`berkas key ${path} kosong`);
  return kunci;
}

function catat(isi) {
  const log = process.env.CODEROACH_KUOTA_LOG;
  if (!log) {
    console.error("CODEROACH_KUOTA_LOG tidak diset; baris log kuota tidak tertulis, catat manual.");
    return;
  }
  const { tanggal, jam } = waktuWib();
  appendFileSync(log, `${barisLog({ tanggal, jam_wib: jam, alat: "gemini.mjs", kredit_flow: 0, ...isi })}\n`);
}

async function panggil(kunci, model, body) {
  const res = await fetch(`${AKAR_API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": kunci },
    body: JSON.stringify(body),
  });
  const isi = await res.json().catch(() => ({}));
  return { status: res.status, isi };
}

function wajibOpsi(opsi, nama) {
  const v = opsi.get(nama);
  if (!v) throw new Error(`${nama} wajib untuk perintah ini`);
  return v;
}

async function daftar(kunci) {
  // models.list tidak memotong jatah generateContent.
  const res = await fetch(`${AKAR_API}/models?pageSize=1000`, { headers: { "x-goog-api-key": kunci } });
  const isi = await res.json();
  if (!res.ok) throw new Error(`daftar model gagal ${res.status}: ${isi?.error?.message ?? ""}`);
  for (const m of isi.models ?? []) {
    console.log(`${m.name.replace(/^models\//, "")}\t${(m.supportedGenerationMethods ?? []).join(" ")}\t${m.displayName ?? ""}`);
  }
}

async function main() {
  const { perintah, opsi } = urai(process.argv.slice(2));
  if (!["daftar", "teks", "suara", "transkrip"].includes(perintah)) {
    console.error("pakai: node gemini.mjs daftar | teks | suara | transkrip (lihat kepala berkas ini)");
    process.exit(2);
  }
  const kunci = bacaKunci();
  try {
    if (perintah === "daftar") return await daftar(kunci);

    const model = wajibOpsi(opsi, "--model");
    const keluar = wajibOpsi(opsi, "--keluar");
    let body;
    if (perintah === "teks") {
      const lampiran = (opsi.get("--lampiran") ?? []).map((p) => ({ nama: basename(p), isi: readFileSync(p, "utf8") }));
      body = permintaanTeks({ prompt: wajibOpsi(opsi, "--prompt"), lampiran });
    } else if (perintah === "suara") {
      body = permintaanSuara({ teks: readFileSync(wajibOpsi(opsi, "--teks-file"), "utf8"), suara: opsi.get("--suara") });
    } else {
      const audioPath = wajibOpsi(opsi, "--audio");
      body = permintaanTranskrip({ audio: readFileSync(audioPath), mime: mimeAudio(audioPath), petunjuk: opsi.get("--petunjuk") });
    }

    const mulai = Date.now();
    const { status, isi } = await panggil(kunci, model, body);
    const detik = Math.round((Date.now() - mulai) / 1000);
    const pakai = isi.usageMetadata ?? {};
    const dasar = {
      pekerjaan: opsi.get("--pekerjaan") ?? `${perintah} ${basename(keluar)}`,
      model, permintaan: 1, detik,
      token_masuk: pakai.promptTokenCount, token_keluar: pakai.candidatesTokenCount,
    };

    if (status !== 200) {
      const kuota = galatKuota(status, isi);
      const hasil = kuota ? `gagal 429 ${kuota.jenis}` : `gagal ${status}`;
      catat({ ...dasar, hasil });
      if (kuota) {
        console.error(`429 (${kuota.quotaId}). ${kuota.jenis === "hari" ? "Jatah harian model ini habis sampai reset." : `Tunggu ${kuota.retryDelay} lalu lapor sebelum mencoba lagi.`} Tidak diulang otomatis.`);
      } else {
        console.error(`gagal ${status}: ${isi?.error?.message ?? "tanpa pesan"}`);
      }
      process.exit(1);
    }

    // Permintaan 200 sudah memotong jatah walau isinya kosong, jadi tetap dicatat.
    try {
      if (perintah === "suara") {
        const { data, mime } = audioDari(isi);
        writeFileSync(keluar, /L16|pcm/i.test(mime) ? pcmKeWav(data, { laju: lajuDariMime(mime) }) : data);
      } else {
        writeFileSync(keluar, teksDari(isi));
      }
    } catch (e) {
      // Bentuk respons tiap model tidak sama (uji 29 Okt: transkrip 200 tanpa part teks);
      // simpan respons mentahnya supaya bisa diperiksa tanpa membakar permintaan lagi.
      writeFileSync(`${keluar}.respons.json`, JSON.stringify(ringkasRespons(isi), null, 2));
      catat({ ...dasar, hasil: `gagal; ${e.message}` });
      throw new Error(`${e.message}; respons mentah di ${keluar}.respons.json`);
    }
    catat({ ...dasar, hasil: `selesai; ${basename(keluar)}` });
    console.log(`${keluar} (${detik} detik, token ${pakai.promptTokenCount ?? "?"}/${pakai.candidatesTokenCount ?? "?"})`);
  } catch (e) {
    console.error(tanpaKunci(e?.message ?? e, kunci));
    process.exit(1);
  }
}

main();
