# Runbook Klinik Sehat

## Server

Satu VPS di Jakarta menjalankan app (Node 22, systemd) dan Postgres 16.
Backup ditulis ke `/var/backup/klinik` di VPS yang sama.

## Backup dan pulih

- Backup: `ops/backup.sh` lewat cron harian.
- Uji pulih: belum pernah dilakukan. Rencananya dicoba setelah peluncuran.
- RTO dan RPO: belum ditentukan.

## Pemantauan

Pemantau luar memanggil `/api/sehat` tiap 5 menit. Alert ke email admin.
