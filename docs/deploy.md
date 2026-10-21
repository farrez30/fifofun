# Deploy ke Vercel

Aplikasi ini hampir seluruhnya dirender di server dan setiap halamannya
menyentuh Postgres. Jadi yang menentukan pengalaman pemakainya bukan ukuran
bundle, melainkan jarak antara fungsi yang merender dan database yang dibaca.
Catatan ini menaruh keduanya di benua yang sama, lalu memasang sisanya dengan
urutan yang tidak membuat satu langkah menunggu langkah yang belum ada.

Semua perintah dijalankan dari akar repo.

## Yang harus ada sebelum mulai

- Akun Vercel, sudah tertaut ke GitHub.
- Project Neon `fifofun` (`silent-forest-61541759`, org VCC, Singapura, PG17).
  Branch `main` untuk produksi, `dev` untuk pengembangan; `.env.local` menunjuk
  `dev`, jadi seed dan migrasi coba-coba dari laptop tidak menyentuh data
  sungguhan.
- Repo sudah terdorong ke `origin`, dan `pnpm build` hijau di mesin sendiri.

## Region

`vercel.json` memasang `regions: ["sin1"]`, Singapura, karena database Neon-nya
ada di `aws-ap-southeast-1`.

Ini bukan penyetelan halus. Default Vercel adalah `iad1` di Washington, dan
setiap halaman di sini menjalankan beberapa query berurutan; dengan default itu
tiap query membayar sekali perjalanan menyeberangi Pasifik, dan pemakainya
menunggu jumlah dari semuanya. Menaruh fungsi di sebelah database menghapus
ongkos itu seluruhnya. Paket Hobby hanya boleh satu region; kalau `vercel.json`
ditolak, setel lewat Settings → Functions → Function Region di dashboard dan
hapus kuncinya dari berkas.

## Variabel lingkungan

| Variabel | Environment | Dari mana |
| --- | --- | --- |
| `DATABASE_POOL_URL` | Production, Preview | `npx neonctl connection-string main --project-id silent-forest-61541759 --pooled` |
| `BETTER_AUTH_URL` | Production, Preview | origin deployment itu sendiri, tanpa garis miring di ujung |
| `BETTER_AUTH_SECRET` | Production, Preview | 32 byte acak; menggantinya mengeluarkan semua orang |
| `NEXT_PUBLIC_SITE_URL` | Production | domain final, tanpa garis miring di ujung |
| `TELEGRAM_BOT_TOKEN` | Production | @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Production | string acak panjang buatan sendiri |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Production | id chat yang boleh menulis, dipisah koma |
| `TELEGRAM_HOUSEHOLD_ID` | Production | uuid rumah tangga tujuan bot |

Tiga hal yang mudah salah di tabel ini.

**`DATABASE_URL` tidak ada di sana, dan itu disengaja.** Yang dipakai saat
melayani permintaan adalah endpoint `-pooler`; endpoint langsung hanya untuk
migrasi dan seed, yang dijalankan dari laptop.
[`src/db/client.ts`](../src/db/client.ts) jatuh ke `DATABASE_URL` kalau
`DATABASE_POOL_URL` kosong, jadi menyetel keduanya berarti salah ketik pada yang
benar akan diam-diam ditutupi oleh yang salah. Tidak menyetelnya membuat
kesalahan itu berisik, yang jauh lebih baik.

**Empat variabel Telegram itu satu paket.** Webhook menulis sebagai pemilik
database dan karena itu melewati row level security, jadi secret dan
allowlist-lah yang berdiri antara URL publik dan baris orang lain. Setel
keempatnya, atau kosongkan keempatnya: tanpa `TELEGRAM_WEBHOOK_SECRET`
endpoint-nya menolak semua permintaan dengan 503, yang memang perilaku yang
diinginkan.

**`BETTER_AUTH_URL` harus persis origin yang dibuka orang.** Better Auth menolak
permintaan dari origin lain, jadi deployment pratinjau butuh nilainya sendiri.

## Jalur A — integrasi Git (rekomendasi)

Setiap dorongan ke `main` jadi produksi, setiap pull request dapat URL
pratinjaunya sendiri, dan tidak ada satu pun deploy yang berasal dari keadaan
laptop seseorang. Itu properti yang sama yang membuat CI berharga.

1. Vercel → **Add New → Project** → impor `farrez30/fifofun`.
2. Framework terdeteksi Next.js; pnpm terdeteksi dari `pnpm-lock.yaml` dan
   versinya dari `packageManager`. Biarkan semua perintah build apa adanya.
3. Isi variabel dari tabel di atas, kecuali `NEXT_PUBLIC_SITE_URL`.
4. **Deploy**. Deploy pertama ini akan berhasil; kartu sosialnya saja yang masih
   menunjuk `localhost`.
5. Setel domainnya, lalu isi `NEXT_PUBLIC_SITE_URL` dengan domain itu dan jalankan
   **Redeploy**. Karena nilainya dipanggang saat build, menyimpannya saja tidak
   cukup.

## Jalur B — Vercel CLI

Berguna kalau ingin deploy tanpa mendorong dulu, atau ingin menyetel variabel
sebagai berkas alih-alih mengetiknya satu per satu di dashboard.

```bash
pnpm add -g vercel
```

```bash
vercel login
```

```bash
vercel link
```

`vercel link` melakukan tiga hal yang tidak semuanya terlihat dari namanya. Ia
membuat `.vercel/`, yang sudah ada di `.gitignore`. Ia menambahkan
`VERCEL_OIDC_TOKEN` ke akhir `.env.local`, tanpa menyentuh baris yang sudah ada.
Dan kalau reponya punya remote GitHub yang bisa ia kenali, **ia menyambungkan
integrasi Git-nya sekalian**, jadi sejak saat itu dorongan ke `main` ikut men-
deploy produksi. Kalau yang diinginkan murni deploy manual, putuskan di
Settings → Git.

Menyetel variabel satu per satu:

```bash
vercel env add DATABASE_POOL_URL production
```

Perintah itu membaca nilainya dari stdin, jadi kredensialnya tidak pernah masuk
riwayat shell. Semua baris di tabel sekaligus, dibaca dari `.env.local`
dengan sifat yang sama:

```bash
bash scripts/push-env.sh production
```

```bash
bash scripts/push-env.sh preview
```

Variabel Telegram sengaja hanya didorong ke `production`. Deployment pratinjau
adalah URL publik kedua ke baris yang sama, dan webhook menulis dengan kunci
rahasia; tanpa secret-nya pratinjau menjawab 503, yang memang yang diinginkan.

Menarik variabel yang sudah ada di Vercel ke berkas lokal, berguna untuk
mereproduksi build produksi:

```bash
vercel env pull .env.production.local
```

Deploy pratinjau, lalu naikkan ke produksi:

```bash
vercel deploy
```

```bash
vercel deploy --prod
```

Kalau memakai jalur ini, tetap sambungkan reponya ke Git belakangan. Deploy dari
laptop mem-build apa pun yang ada di direktori kerja, termasuk yang belum
di-commit.

## Migrasi database

Vercel tidak menjalankan migrasi, dan sebaiknya memang tidak: build berjalan
paralel dan bisa diulang, dua di antaranya yang bertemu di satu database adalah
cara yang bagus untuk merusaknya.

Jalankan dari laptop, dengan `DATABASE_URL` menunjuk endpoint langsung branch
yang dituju (`main` untuk produksi). `drizzle/prelude-neon.sql` jalan lebih dulu
setiap kali: ia membuat ulang yang dulu disediakan Supabase sebelum migrasi 0000
(role, schema `auth`, `auth.users`, `auth.uid()`), dan aman diulang:

```bash
pnpm db:migrate
```

Urutannya penting saat migrasinya menghapus atau mengganti nama kolom. Migrasi
yang hanya menambah boleh jalan kapan saja; yang menghapus harus jalan setelah
deploy yang berhenti memakai kolom itu, kalau tidak versi lama yang masih
melayani permintaan akan gagal di antara keduanya.

Jangan jalankan `pnpm db:seed` terhadap produksi.

## Pindah dari Supabase (sekali saja)

`pnpm db:import-supabase` menyalin seluruh `public` dan `auth.users` dari
Supabase ke branch Neon yang sudah dimigrasi dan masih kosong, dalam satu
transaksi. Id user dan hash bcrypt ikut, jadi semua orang masuk dengan kata
sandi lamanya. Sesi tidak ikut: semua orang masuk sekali lagi.

1. `pnpm db:migrate` ke branch `main` Neon (endpoint langsung).
2. Latihan dulu. Semua dibaca, ditulis, dan dicocokkan jumlah serta md5 isinya
   per tabel, lalu di-rollback:

   ```bash
   SOURCE_DATABASE_URL=<supabase, koneksi langsung> DATABASE_URL=<neon main, langsung> \
     IMPORT_ALLOW_REMOTE=1 pnpm db:import-supabase --kering
   ```

3. Kalau semua baris berakhir `isi sama`, jalankan lagi tanpa `--kering`. Satu
   tabel yang beda membatalkan seluruh salinan, jadi tidak ada keadaan
   setengah jadi.
4. Ganti env Production di Vercel: `DATABASE_URL` (langsung),
   `DATABASE_POOL_URL` (`-pooler`), `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`. Hapus env Supabase, lalu Redeploy.
5. Periksa seperti bagian Verifikasi di bawah. Biarkan project Supabase hidup
   sampai beberapa hari tanpa masalah; itulah jalan mundurnya (kembalikan env
   lama, lalu promote deploy sebelumnya).

Data yang dicatat di Neon setelah langkah 4 tidak ikut mundur kalau jalan mundur
itu dipakai, jadi putuskan dalam hitungan jam, bukan hari.

## Setelah deploy pertama

**Auth.** `BETTER_AUTH_URL` di Production diisi domain produksi lalu Redeploy.
Tidak ada lagi email konfirmasi pendaftaran: akun dibuat dari form daftar dengan
kode undangan dan langsung bisa masuk.

**Telegram.** Webhook menunjuk domain lama sampai didaftarkan ulang:

```bash
curl -F "url=https://DOMAIN-KAMU/api/telegram" -F "secret_token=NILAI_SECRET" https://api.telegram.org/botTOKEN/setWebhook
```

**Service worker.** `next.config.ts` menyajikan `/sw.js` dengan
`Cache-Control: no-cache`, jadi pemakai yang sudah memasang PWA-nya mengambil
worker baru pada kunjungan berikutnya. Tidak ada yang perlu dilakukan; ini
dicatat karena kalau header itu hilang, deploy akan berhenti sampai ke orang
yang sudah memasang aplikasinya.

## Verifikasi

Yang diperiksa bukan apakah halamannya terbuka, melainkan apakah gerbang yang
hanya hidup di produksi benar-benar hidup.

1. Buka `/`, masuk, dan pastikan angkanya muncul. Ini sekaligus membuktikan
   pooler, RLS, dan refresh sesi di proxy bekerja.
2. Periksa header CSP-nya benar-benar terkirim, dan tidak dalam mode dev:

   ```bash
   curl -sI https://DOMAIN-KAMU | grep -i content-security-policy
   ```

   Harus ada `strict-dynamic` dan tidak boleh ada `unsafe-eval`.
3. Impor satu statement lewat `/impor` dan pastikan rekonsiliasinya lulus.
4. Kalau bot dipakai, kirim satu pesan dan pastikan barisnya masuk. Lalu kirim
   permintaan tanpa secret dan pastikan ditolak:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://DOMAIN-KAMU/api/telegram
   ```

   Harus `401`.

## Batas yang berlaku di produksi tapi tidak di lokal

**Ukuran unggahan.** Vercel menolak body permintaan di atas 4,5MB di edge,
sebelum kode mana pun berjalan. Impor e-Statement lewat route handler
`/impor/unggah`, bukan Server Action, dan route itu menolak body di atas 3MB
dari `Content-Length` sebelum membacanya, supaya pesan yang muncul adalah pesan
tentang statement, bukan halaman error dari edge. Statement Mandiri sungguhan
berukuran sekitar 45KB. Server Action lain hanya membawa beberapa field, jadi
`serverActions.bodySizeLimit` dibiarkan di default 1MB.

**Durasi fungsi.** Paket Hobby memutus fungsi di 60 detik; route impor
menuliskannya sebagai `maxDuration`. Tidak ada di aplikasi ini yang
mendekatinya, termasuk impor. Kalau suatu saat terjadi, klien menerima 504 dan
menampilkannya sebagai "Server berhenti sebelum impornya selesai".

**Rate limit Telegram.** Jendela geser di route Telegram disimpan di memori
instance, jadi ia ikut hilang setiap kali instance-nya didaur ulang. Itu rem,
bukan jaminan; gerbang sebenarnya tetap allowlist.

## Pembaruan dependensi

Dependabot membuka satu PR per minggu (Senin) untuk semua kenaikan minor dan
patch, setelah versi barunya berumur minimal 3 hari. PR itu masuk sendiri
begitu CI lolos, lewat `.github/workflows/dependabot-auto-merge.yml`. Kenaikan
major tetap PR terpisah dan menunggu direview. Security update dari GitHub
datang di luar jadwal ini, begitu advisory-nya terbit.

Auto-merge bergantung pada pengaturan yang tidak ada di repo, jadi ditulis di
sini:

- **Settings → General → Allow auto-merge** menyala.
- **Branch protection di `main`** mewajibkan enam check: keempat job di
  `ci.yml`, plus CodeQL dan Secret scan dari `security.yml`. Tanpa aturan ini
  `gh pr merge --auto` langsung menggabungkan PR tanpa menunggu tes, jadi
  aturan ini jangan dihapus selama workflow auto-merge masih ada. Kalau nama
  job di CI diganti, daftar check wajibnya ikut diganti.
- `enforce_admins` dimatikan, supaya pemilik repo tetap bisa push langsung ke
  `main`.

## Rollback

Deployments → pilih deploy yang baik sebelumnya → **Promote to Production**.
Berlangsung seketika karena build-nya sudah ada.

Yang tidak ikut mundur adalah database. Kalau deploy yang gagal sempat
menjalankan migrasi, rollback mengembalikan kode ke versi yang tidak mengenal
skema yang sekarang. Itu alasan lain migrasi dijalankan sebagai langkah
tersendiri dan dibuat hanya-menambah kapan pun bisa.
