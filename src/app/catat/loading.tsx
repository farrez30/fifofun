import { ShellFallback } from '@/components/shell-fallback'
import { EntrySkeleton } from './skeleton'

/** The entry form's shell while it renders. Title and lead mirror page.tsx exactly. */
export default function CatatLoading() {
  return (
    <ShellFallback
      title="Catat transaksi"
      current="/catat"
      lead="Untuk uang yang tidak lewat e-Statement: tunai, e-wallet, dan koreksi saldo. Yang lewat Mandiri akan dicocokkan sendiri saat statement berikutnya diimpor."
    >
      <EntrySkeleton />
    </ShellFallback>
  )
}
