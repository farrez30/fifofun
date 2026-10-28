// Jenis pesan antara halaman induk (panggung.js) dan halaman 3D di iframe
// (halaman.js). Berkas terpisah supaya halaman 3D tidak ikut memuat mesin
// gulir induk hanya untuk dua konstanta ini.

/** Induk ke halaman 3D: progres gulir 0..1. */
export const JENIS_PROGRES = "rakit-p";

/** Halaman 3D ke induk: listener sudah terpasang, kirim progres terakhir. */
export const JENIS_SIAP = "rakit-siap";
