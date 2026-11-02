// node:test, supaya ikut jalan di repo pemakai skill yang tidak punya vitest.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  audioDari, barisLog, galatKuota, lajuDariMime, mimeAudio, pcmKeWav, permintaanSuara,
  permintaanTeks, permintaanTranskrip, ringkasRespons, tanpaKunci, teksDari, urai, waktuWib, BATAS_AUDIO,
} from "./gemini-inti.mjs";

describe("urai", () => {
  it("memisahkan perintah dan opsi, lampiran boleh berulang", () => {
    const { perintah, opsi } = urai(["teks", "--model", "m", "--lampiran", "a.md", "--lampiran", "b.md"]);
    assert.equal(perintah, "teks");
    assert.equal(opsi.get("--model"), "m");
    assert.deepEqual(opsi.get("--lampiran"), ["a.md", "b.md"]);
  });

  it("opsi tanpa nilai ditolak, bukan diam-diam memakan opsi berikutnya", () => {
    assert.throws(() => urai(["teks", "--model", "--keluar", "x"]), /--model butuh nilai/);
    assert.throws(() => urai(["teks", "--keluar"]), /--keluar butuh nilai/);
    assert.throws(() => urai(["teks", "lepas"]), /tidak dikenal/);
  });
});

describe("bentuk permintaan", () => {
  it("lampiran teks diberi label nama berkas, setelah instruksi", () => {
    const b = permintaanTeks({ prompt: "Tulis caption", lampiran: [{ nama: "brief.md", isi: "isi" }] });
    assert.deepEqual(b.contents[0].parts.map((p) => p.text), ["Tulis caption", "--- lampiran: brief.md ---\nisi"]);
  });

  it("suara meminta modalitas AUDIO dengan suara bawaan Kore", () => {
    const b = permintaanSuara({ teks: "Halo" });
    assert.deepEqual(b.generationConfig.responseModalities, ["AUDIO"]);
    assert.equal(b.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore");
  });

  it("transkrip mengirim audio base64 inline beserta mime-nya", () => {
    const b = permintaanTranskrip({ audio: Buffer.from("abc"), mime: "audio/mp3" });
    const [teks, audio] = b.contents[0].parts;
    assert.match(teks.text, /Jangan meringkas/);
    assert.deepEqual(audio.inlineData, { mimeType: "audio/mp3", data: "YWJj" });
  });

  it("audio tepat di batas lolos, satu byte di atasnya ditolak", () => {
    assert.doesNotThrow(() => permintaanTranskrip({ audio: Buffer.alloc(BATAS_AUDIO), mime: "audio/wav" }));
    assert.throws(() => permintaanTranskrip({ audio: Buffer.alloc(BATAS_AUDIO + 1), mime: "audio/wav" }), /batas inline/);
  });

  it("mime dari ekstensi, tanpa peduli huruf besar; format asing ditolak", () => {
    assert.equal(mimeAudio("RAPAT.MP3"), "audio/mp3");
    assert.equal(mimeAudio("a.b/rekaman.flac"), "audio/flac");
    assert.throws(() => mimeAudio("rapat.m4a"), /tidak didukung/);
  });
});

describe("membaca respons", () => {
  it("teks dari beberapa part digabung", () => {
    assert.equal(teksDari({ candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] }), "ab");
  });

  it("model transkrip menaruh hasilnya di audioTranscription.text (respons nyata 29 Okt)", () => {
    const r = { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ audioTranscription: { text: "Sering kaget lihat selisih kas" } }] } }] };
    assert.equal(teksDari(r), "Sering kaget lihat selisih kas");
  });

  it("respons tanpa teks melempar dengan finishReason, bukan menulis berkas kosong", () => {
    assert.throws(() => teksDari({ candidates: [{ finishReason: "SAFETY" }] }), /SAFETY/);
    assert.throws(() => teksDari({}), /tidak ada/);
  });

  it("audio diambil dari part inlineData pertama yang berisi", () => {
    const r = { candidates: [{ content: { parts: [{ text: "x" }, { inlineData: { mimeType: "audio/L16;rate=24000", data: "AAEC" } }] } }] };
    const a = audioDari(r);
    assert.deepEqual([...a.data], [0, 1, 2]);
    assert.equal(lajuDariMime(a.mime), 24000);
    assert.equal(lajuDariMime("audio/L16;codec=pcm"), 24000);
    assert.equal(lajuDariMime("audio/L16;rate=16000"), 16000);
  });
});

describe("ringkasRespons", () => {
  it("base64 diganti ukurannya, field lain utuh, aslinya tidak berubah", () => {
    const asli = { candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "audio/L16", data: "AAAA" } }] } }] };
    const r = ringkasRespons(asli);
    assert.equal(r.candidates[0].content.parts[0].inlineData.data, "<base64 4 karakter>");
    assert.equal(r.candidates[0].content.parts[0].inlineData.mimeType, "audio/L16");
    assert.equal(r.candidates[0].finishReason, "STOP");
    assert.equal(asli.candidates[0].content.parts[0].inlineData.data, "AAAA");
  });

  it("respons kosong tetap menghasilkan objek", () => {
    assert.deepEqual(ringkasRespons(undefined), {});
  });
});

describe("pcmKeWav", () => {
  it("header 44 byte sesuai format PCM yang ditulis", () => {
    const pcm = Buffer.alloc(48000); // 1 detik, 24 kHz mono 16-bit
    const w = pcmKeWav(pcm);
    assert.equal(w.length, 44 + pcm.length);
    assert.equal(w.toString("ascii", 0, 4), "RIFF");
    assert.equal(w.readUInt32LE(4), 36 + pcm.length);
    assert.equal(w.toString("ascii", 8, 16), "WAVEfmt ");
    assert.equal(w.readUInt16LE(20), 1); // PCM
    assert.equal(w.readUInt16LE(22), 1); // mono
    assert.equal(w.readUInt32LE(24), 24000);
    assert.equal(w.readUInt32LE(28), 48000); // byte per detik
    assert.equal(w.readUInt16LE(32), 2); // block align
    assert.equal(w.readUInt16LE(34), 16);
    assert.equal(w.toString("ascii", 36, 40), "data");
    assert.equal(w.readUInt32LE(40), pcm.length);
  });
});

describe("galatKuota", () => {
  const body = (quotaId, retryDelay) => ({
    error: { details: [{ violations: [{ quotaId }] }, { retryDelay }] },
  });

  it("membedakan batas per menit dan per hari dari quotaId", () => {
    assert.deepEqual(galatKuota(429, body("GenerateContentInputTokensPerModelPerMinute-FreeTier", "47s")), {
      jenis: "menit", quotaId: "GenerateContentInputTokensPerModelPerMinute-FreeTier", retryDelay: "47s",
    });
    assert.equal(galatKuota(429, body("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "77118s")).jenis, "hari");
  });

  it("429 tanpa rincian tetap terbaca sebagai kuota; status lain bukan kuota", () => {
    assert.equal(galatKuota(429, {}).jenis, "lain");
    assert.equal(galatKuota(500, body("x", "1s")), null);
  });
});

describe("log kuota", () => {
  it("jam WIB dihitung dari UTC+7, termasuk lewat tengah malam", () => {
    assert.deepEqual(waktuWib(new Date("2026-10-28T07:00:00Z")), { tanggal: "2026-10-28", jam: "14:00" });
    assert.deepEqual(waktuWib(new Date("2026-10-28T17:30:00Z")), { tanggal: "2026-10-29", jam: "00:30" });
  });

  it("kolom mengikuti urutan log, jam_wib di ujung, sel kosong untuk yang tidak ada", () => {
    const b = barisLog({ tanggal: "2026-10-29", pekerjaan: "caption", alat: "gemini.mjs", model: "m", permintaan: 1, hasil: "selesai", jam_wib: "09:15" });
    assert.equal(b, "2026-10-29,caption,gemini.mjs,m,1,,,,,selesai,09:15");
  });

  it("koma, kutip, dan baris baru di isi dikutip supaya kolom tidak bergeser", () => {
    const b = barisLog({ pekerjaan: 'iklan "A", B', hasil: "gagal;\nbaris" });
    assert.equal(b.split(",")[0], "");
    assert.match(b, /"iklan ""A"", B"/);
    assert.match(b, /"gagal;\nbaris"/);
  });
});

describe("tanpaKunci", () => {
  it("mengganti setiap kemunculan key, dan aman bila key kosong", () => {
    assert.equal(tanpaKunci("a KEY b KEY", "KEY"), "a [kunci] b [kunci]");
    assert.equal(tanpaKunci("apa adanya", ""), "apa adanya");
  });
});
