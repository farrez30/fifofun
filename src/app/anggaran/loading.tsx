import { ShellFallback } from '@/components/shell-fallback'
import { BudgetSkeleton } from './skeleton'

/** The budget page's shell while it renders. Title and lead mirror page.tsx exactly. */
export default function AnggaranLoading() {
  return (
    <ShellFallback
      title="Anggaran"
      current="/anggaran"
      lead="Tetapkan batas per kategori untuk satu bulan. Biasanya dan bulan lalu ada di samping kolomnya supaya angkanya tidak ditebak dari kosong."
    >
      <BudgetSkeleton />
    </ShellFallback>
  )
}
