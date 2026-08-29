import { ShellFallback } from '@/components/shell-fallback'
import { FundsSkeleton } from './skeleton'

/** The funds page's shell while it renders. Title and lead mirror page.tsx exactly. */
export default function DanaLoading() {
  return (
    <ShellFallback
      title="Dana"
      current="/dana"
      lead="Tabungan, sinking fund dan tujuan, beserta laju setorannya. Targetnya boleh ditentukan dari tenggat, atau dari setoran per bulan yang kamu sanggup."
    >
      <FundsSkeleton />
    </ShellFallback>
  )
}
