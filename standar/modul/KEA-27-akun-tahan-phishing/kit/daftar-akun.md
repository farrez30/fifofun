# Daftar akun studio

Akun yang memegang kunci ke project klien, siapa pemiliknya, dan seberapa tahan
phishing login-nya. Diperiksa `periksa-akun.mjs`. **Tanpa email, nama pengguna,
kode, atau token**: yang dicatat hanya jenis faktor dan letak penyimpanannya.

Nilai yang sah:

- Faktor login: `passkey`, `security-key` (WebAuthn sebagai faktor kedua; passkey di password manager boleh mengisinya), `lewat-google` (layanan tanpa login sendiri; ikut baris Google pemilik yang sama), `totp`, `sms`, `kata-sandi`, `belum-dicek`
- Faktor lemah dihapus: `ya`, `tidak`, `tidak-ada`, `belum-dicek`
- 2FA wajib di organisasi: `ya`, `tidak`, `tidak-tersedia`, `bukan-organisasi`, `belum-dicek`
- Recovery code: `bitwarden`, `kertas`, `tidak-tersedia`, `belum-disimpan`, `belum-dicek`
- Tinjau OAuth: tanggal `YYYY-MM-DD` tinjauan terakhir, `belum`, atau `tidak-ada` (layanan tanpa grant OAuth pihak ketiga)

| Layanan | Pemilik | Faktor login | Faktor lemah dihapus | 2FA wajib di organisasi | Recovery code | Tinjau OAuth | Halaman keamanan |
|---|---|---|---|---|---|---|---|
| GitHub | pemilik-1 | belum-dicek | belum-dicek | belum-dicek | belum-dicek | belum | https://github.com/settings/security |
