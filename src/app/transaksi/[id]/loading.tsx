import { ShellFallback } from '@/components/shell-fallback'
import { EntryDetailSkeleton } from './skeleton'

/** A transaction detail's shell while it renders. Title and lead mirror page.tsx exactly. */
export default function TransaksiLoading() {
  return (
    <ShellFallback
      title="Ubah transaksi"
      current="/transaksi"
      lead="Kategori, keterangan, dan catatan bisa diubah di semua transaksi. Nominal, tanggal, dan akun hanya pada catatan manual dan Telegram."
    >
      <EntryDetailSkeleton />
    </ShellFallback>
  )
}
