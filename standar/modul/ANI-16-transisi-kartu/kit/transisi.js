// ANI-16 transisi kartu ke detail dengan View Transitions API.
//
// Satu elemen (mis. foto kartu) dianimasikan browser dari kotak lamanya ke
// kotak barunya saat tampilan berganti: nama view-transition dipasang di
// elemen asal sebelum pergantian, lalu dipindah ke elemen tujuan di dalam
// callback. Dukungan per Oktober 2026 (MDN browser-compat-data): same-document
// di Chrome 111, Safari 18, Firefox 144 (Baseline sejak 14 Okt 2025). Tanpa
// API, atau saat kurangi gerak, tampilan berganti biasa: hasil akhirnya sama,
// hanya tanpa animasi. Browser tidak mematikan transisi sendiri untuk kurangi
// gerak; itu tugas kode ini.

/** Apakah pergantian dianimasikan. Murni. */
export function bisaTransisi({ adaApi, kurangiGerak }) {
  return Boolean(adaApi) && !kurangiGerak;
}

const NAMA = /^[a-z][a-z0-9-]*$/;

/**
 * Ganti tampilan dari `dari` ke `ke`. `ubah()` mengerjakan pergantian DOM-nya
 * (sinkron), `sesudah()` dipanggil setelah DOM baru siap, untuk memindah
 * fokus. Mengembalikan janji yang selesai setelah animasi (atau langsung bila
 * tanpa animasi).
 */
export async function gantiDenganTransisi({ dari, ke, ubah, sesudah = () => {}, nama = "rakit-vt", d = document, w = window, kurangiGerak } = {}) {
  if (!NAMA.test(nama)) throw new Error(`nama view-transition tidak sah: ${nama}`);
  const kurangi = kurangiGerak ?? w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!bisaTransisi({ adaApi: typeof d.startViewTransition === "function", kurangiGerak: kurangi })) {
    ubah();
    sesudah();
    return;
  }
  dari.style.viewTransitionName = nama;
  const t = d.startViewTransition(() => {
    dari.style.viewTransitionName = "";
    ubah();
    ke.style.viewTransitionName = nama;
  });
  // Callback yang gagal tetap membuat DOM berganti (atau tidak), tetapi fokus
  // harus selalu pindah dan nama harus selalu dilepas, apa pun hasilnya.
  await t.updateCallbackDone.catch(() => {});
  sesudah();
  await t.finished.catch(() => {});
  ke.style.viewTransitionName = "";
}
