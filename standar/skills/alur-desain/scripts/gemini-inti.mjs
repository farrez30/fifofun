// Bagian murni dari gemini.mjs: bentuk permintaan, pembacaan respons, WAV, dan
// baris log kuota. Tanpa jaringan dan tanpa efek samping, supaya bisa diimpor tes.

export const AKAR_API = "https://generativelanguage.googleapis.com/v1beta";

// Batas permintaan inline Gemini 20 MB, dan base64 membengkakkan isi 4/3 kali.
export const BATAS_AUDIO = 14 * 1024 * 1024;

const MIME_AUDIO = {
  ".wav": "audio/wav",
  ".mp3": "audio/mp3",
  ".aiff": "audio/aiff",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

/** `--nama nilai` jadi Map; opsi yang boleh berulang dikumpulkan jadi array. */
export function urai(argv, berulang = ["--lampiran"]) {
  const [perintah, ...sisa] = argv;
  const opsi = new Map();
  for (let i = 0; i < sisa.length; i++) {
    const nama = sisa[i];
    if (!nama.startsWith("--")) throw new Error(`argumen tidak dikenal: ${nama}`);
    const nilai = sisa[i + 1];
    if (nilai === undefined || nilai.startsWith("--")) throw new Error(`${nama} butuh nilai`);
    i++;
    if (berulang.includes(nama)) opsi.set(nama, [...(opsi.get(nama) ?? []), nilai]);
    else opsi.set(nama, nilai);
  }
  return { perintah, opsi };
}

export function mimeAudio(path) {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const mime = MIME_AUDIO[ext];
  if (!mime) throw new Error(`format audio ${ext} tidak didukung; pakai ${Object.keys(MIME_AUDIO).join(" ")}`);
  return mime;
}

/** Lampiran teks digabung di belakang instruksi, masing-masing berlabel nama berkasnya. */
export function permintaanTeks({ prompt, lampiran = [] }) {
  const parts = [{ text: prompt }];
  for (const l of lampiran) parts.push({ text: `--- lampiran: ${l.nama} ---\n${l.isi}` });
  return { contents: [{ role: "user", parts }] };
}

export function permintaanSuara({ teks, suara = "Kore" }) {
  return {
    contents: [{ role: "user", parts: [{ text: teks }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: suara } } },
    },
  };
}

export function permintaanTranskrip({ audio, mime, petunjuk }) {
  if (audio.length > BATAS_AUDIO) {
    throw new Error(`audio ${(audio.length / 1048576).toFixed(1)} MB melewati batas inline 14 MB; potong dulu`);
  }
  const teks =
    petunjuk ??
    "Transkripsikan rekaman ini apa adanya dalam bahasa aslinya. Beri penanda waktu [mm:ss] tiap ganti pembicara. Jangan meringkas dan jangan menambah isi.";
  return {
    contents: [{ role: "user", parts: [{ text: teks }, { inlineData: { mimeType: mime, data: audio.toString("base64") } }] }],
  };
}

export function teksDari(respon) {
  const parts = respon?.candidates?.[0]?.content?.parts ?? [];
  // gemini-3.5-transcribe membalas dengan part audioTranscription, bukan text.
  const teks = parts.map((p) => p.text ?? p.audioTranscription?.text ?? "").join("");
  if (!teks) throw new Error(`respons tanpa teks (finishReason: ${respon?.candidates?.[0]?.finishReason ?? "tidak ada"})`);
  return teks;
}

export function audioDari(respon) {
  const parts = respon?.candidates?.[0]?.content?.parts ?? [];
  const p = parts.find((x) => x.inlineData?.data);
  if (!p) throw new Error(`respons tanpa audio (finishReason: ${respon?.candidates?.[0]?.finishReason ?? "tidak ada"})`);
  return { data: Buffer.from(p.inlineData.data, "base64"), mime: p.inlineData.mimeType ?? "" };
}

/** Salinan respons untuk diperiksa, dengan isi base64 diganti ukurannya supaya berkasnya kecil. */
export function ringkasRespons(respon) {
  return JSON.parse(
    JSON.stringify(respon ?? {}, (k, v) => (k === "data" && typeof v === "string" ? `<base64 ${v.length} karakter>` : v)),
  );
}

/** `audio/L16;codec=pcm;rate=24000` jadi 24000. TTS Gemini memakai 24 kHz bila tidak disebut. */
export function lajuDariMime(mime) {
  const m = /rate=(\d+)/.exec(mime);
  return m ? Number(m[1]) : 24000;
}

/** TTS mengembalikan PCM 16-bit mentah; pemutar butuh header RIFF/WAVE 44 byte di depannya. */
export function pcmKeWav(pcm, { laju = 24000, kanal = 1, bit = 16 } = {}) {
  const h = Buffer.alloc(44);
  const perDetik = (laju * kanal * bit) / 8;
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(kanal, 22);
  h.writeUInt32LE(laju, 24);
  h.writeUInt32LE(perDetik, 28);
  h.writeUInt16LE((kanal * bit) / 8, 32);
  h.writeUInt16LE(bit, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/**
 * Penolakan kuota dibaca dari quotaId-nya, karena tindakannya berbeda: batas per menit
 * cukup ditunggu, batas harian berarti model itu habis sampai reset.
 */
export function galatKuota(status, body) {
  if (status !== 429) return null;
  const detail = body?.error?.details ?? [];
  const pelanggaran = detail.find((d) => d.violations)?.violations?.[0];
  const quotaId = pelanggaran?.quotaId ?? "";
  const retryDelay = detail.find((d) => d.retryDelay)?.retryDelay ?? "";
  const jenis = /PerDay/i.test(quotaId) ? "hari" : /PerMinute/i.test(quotaId) ? "menit" : "lain";
  return { jenis, quotaId, retryDelay };
}

/** Tanggal dan jam WIB (UTC+7, tanpa musim panas) untuk kolom log. */
export function waktuWib(saat = new Date()) {
  const wib = new Date(saat.getTime() + 7 * 3600 * 1000).toISOString();
  return { tanggal: wib.slice(0, 10), jam: wib.slice(11, 16) };
}

const KOLOM = [
  "tanggal", "pekerjaan", "alat", "model", "permintaan", "token_masuk",
  "token_keluar", "kredit_flow", "detik", "hasil", "jam_wib",
];

function sel(v) {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Satu baris CSV sesuai kolom log kuota di references/anggaran-konten.md. */
export function barisLog(isi) {
  return KOLOM.map((k) => sel(isi[k])).join(",");
}

/** Pagar terakhir: teks yang dicetak atau dicatat tidak pernah memuat key. */
export function tanpaKunci(teks, kunci) {
  return kunci ? String(teks).split(kunci).join("[kunci]") : String(teks);
}
