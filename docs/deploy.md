# Deploy ke Vercel

Aplikasi ini hampir seluruhnya dirender di server dan setiap halamannya
menyentuh Postgres. Jadi yang menentukan pengalaman pemakainya bukan ukuran
bundle, melainkan jarak antara fungsi yang merender dan database yang dibaca.
Catatan ini menaruh keduanya di benua yang sama, lalu memasang sisanya dengan
urutan yang tidak membuat satu langkah menunggu langkah yang belum ada.

Semua perintah dijalankan dari akar repo.

## Yang harus ada sebelum mulai

- Akun Vercel, sudah tertaut ke GitHub.
- Project Supabase yang akan dipakai produksi. Boleh project yang sama dengan
  yang dipakai `.env.local`, tapi lihat catatan di bawah sebelum memutuskan.
- Repo sudah terdorong ke `origin`, dan `pnpm build` hijau di mesin sendiri.

## Satu project Supabase, atau dua

Yang paling murah adalah memakai satu project untuk lokal dan produksi. Yang
paling benar adalah dua: begitu ada satu orang lain memakai aplikasinya,
`pnpm db:seed` atau satu migrasi yang salah dari laptop menimpa data sungguhan,
dan tidak ada yang mengingatkan sebelum itu terjadi.

Rekomendasinya dua project sejak awal, karena memisahkannya belakangan berarti
memindahkan data, bukan mengganti satu variabel. Kalau tetap satu, perlakukan
`.env.local` sebagai kredensial produksi dan jangan pernah menjalankan seed di
atasnya.

Region project menentukan region fungsi di langkah berikutnya. Baca dari host
pooler-nya: `aws-0-ap-northeast-1.pooler.supabase.com` berarti Tokyo.

## Region

`vercel.json` memasang `regions: ["hnd1"]`, Tokyo, karena project Supabase-nya
ada di `ap-northeast-1`.

Ini bukan penyetelan halus. Default Vercel adalah `iad1` di Washington, dan
setiap halaman di sini menjalankan beberapa query berurutan; dengan default itu
tiap query membayar sekali perjalanan menyeberangi Pasifik, dan pemakainya
menunggu jumlah dari semuanya. Menaruh fungsi di sebelah database menghapus
ongkos itu seluruhnya.

Kalau project Supabase-mu ada di region lain, ganti kodenya:
Singapura `sin1`, Sydney `syd1`, Frankfurt `fra1`, Washington `iad1`. Paket
Hobby hanya boleh satu region; kalau `vercel.json` ditolak, setel lewat
Settings → Functions → Function Region di dashboard dan hapus kuncinya dari
berkas.

## Variabel lingkungan

| Variabel | Environment | Dari mana |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | Supabase → Project Settings → Data API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production, Preview | idem, kunci `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | Production | idem, kunci `sb_secret_…`. Server saja |
| `DATABASE_POOL_URL` | Production, Preview | Connect → Transaction pooler, port 6543 |
| `NEXT_PUBLIC_SITE_URL` | Production | domain final, tanpa garis miring di ujung |
| `TELEGRAM_BOT_TOKEN` | Production | @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Production | string acak panjang buatan sendiri |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Production | id chat yang boleh menulis, dipisah koma |
| `TELEGRAM_HOUSEHOLD_ID` | Production | uuid rumah tangga tujuan bot |

Tiga hal yang mudah salah di tabel ini.

**`DATABASE_URL` tidak ada di sana, dan itu disengaja.** Yang dipakai saat
melayani permintaan adalah transaction pooler di port 6543; session pooler di
5432 hanya untuk migrasi dan seed, yang dijalankan dari laptop.
[`src/db/client.ts`](../src/db/client.ts) jatuh ke `DATABASE_URL` kalau
`DATABASE_POOL_URL` kosong, jadi menyetel keduanya berarti salah ketik pada yang
benar akan diam-diam ditutupi oleh yang salah, dan aplikasinya berjalan di
pooler yang tidak sanggup menahan jumlah koneksi serverless sampai kehabisan.
Tidak menyetelnya membuat kesalahan itu berisik, yang jauh lebih baik.

**Empat variabel Telegram itu satu paket.** Webhook menulis dengan kunci rahasia
dan karena itu melewati row level security, jadi secret dan allowlist-lah yang
berdiri antara URL publik dan baris orang lain. Setel keempatnya, atau kosongkan
keempatnya: tanpa `TELEGRAM_WEBHOOK_SECRET` endpoint-nya menolak semua
permintaan dengan 503, yang memang perilaku yang diinginkan.

**Yang berawalan `NEXT_PUBLIC_` dipanggang saat build.** Mengubahnya tidak
berpengaruh sampai ada deploy baru. Ini juga sebabnya `NEXT_PUBLIC_SITE_URL`
punya masalah ayam-dan-telur di deploy pertama, yang ditangani di bawah.

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
riwayat shell. Kesembilan baris di tabel sekaligus, dibaca dari `.env.local`
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

Jalankan dari laptop, dengan `DATABASE_URL` di `.env.local` menunjuk session
pooler project produksi:

```bash
pnpm db:migrate
```

Urutannya penting saat migrasinya menghapus atau mengganti nama kolom. Migrasi
yang hanya menambah boleh jalan kapan saja; yang menghapus harus jalan setelah
deploy yang berhenti memakai kolom itu, kalau tidak versi lama yang masih
melayani permintaan akan gagal di antara keduanya.

Jangan jalankan `pnpm db:seed` terhadap produksi.

## Setelah deploy pertama

**Supabase Auth.** Authentication → URL Configuration → Site URL diisi domain
produksi. Email konfirmasi pendaftaran memakai nilai ini, dan kalau masih
`localhost` tautannya mati untuk semua orang selain kamu.

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
sebelum kode mana pun berjalan. `serverActions.bodySizeLimit` diset `4mb` agar
tetap di bawahnya, dan batas milik aksi impor sendiri diset 3MB agar pesan
kesalahan yang muncul adalah pesan tentang statement, bukan kesalahan transport.
Statement Mandiri sungguhan berukuran sekitar 45KB, jadi ketiga angka ini jauh
di atas kebutuhan; yang penting adalah urutannya, dan urutan itu akan rusak
kalau salah satunya diubah sendirian.

**Durasi fungsi.** Paket Hobby memutus fungsi di 60 detik. Tidak ada di aplikasi
ini yang mendekatinya, termasuk impor, tapi ini yang akan pertama kali terkena
kalau suatu saat ada pekerjaan batch.

**Rate limit Telegram.** Jendela geser di route Telegram disimpan di memori
instance, jadi ia ikut hilang setiap kali instance-nya didaur ulang. Itu rem,
bukan jaminan; gerbang sebenarnya tetap allowlist.

## Rollback

Deployments → pilih deploy yang baik sebelumnya → **Promote to Production**.
Berlangsung seketika karena build-nya sudah ada.

Yang tidak ikut mundur adalah database. Kalau deploy yang gagal sempat
menjalankan migrasi, rollback mengembalikan kode ke versi yang tidak mengenal
skema yang sekarang. Itu alasan lain migrasi dijalankan sebagai langkah
tersendiri dan dibuat hanya-menambah kapan pun bisa.
