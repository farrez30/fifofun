import { ShellFallback } from '@/components/shell-fallback'
import { ReportSkeleton } from './skeleton'

/** The report's shell while it renders. Title and lead mirror page.tsx exactly. */
export default function LaporanLoading() {
  return (
    <ShellFallback
      title="Laporan"
      current="/laporan"
      lead="Potong catatanmu menurut tanggal, cashflow, kategori, atau akun. Setiap pilihan tersimpan di alamat halaman, jadi bisa ditandai dan dikirim."
    >
      <ReportSkeleton />
    </ShellFallback>
  )
}
