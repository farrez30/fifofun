import { ShellFallback } from '@/components/shell-fallback'
import { BudgetSkeleton } from './skeleton'

/** The budget page's shell while it renders. Title and lead mirror page.tsx exactly. */
export default function AnggaranLoading() {
  return (
    <ShellFallback title="Anggaran" current="/anggaran">
      <BudgetSkeleton />
    </ShellFallback>
  )
}
