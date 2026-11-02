import { ShellFallback } from '@/components/shell-fallback'
import { ReportSkeleton } from './skeleton'

/** The report's shell while it renders. Title mirrors page.tsx exactly. */
export default function LaporanLoading() {
  return (
    <ShellFallback
      title="Laporan"
      current="/laporan"
    >
      <ReportSkeleton />
    </ShellFallback>
  )
}
