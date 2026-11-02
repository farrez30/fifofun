import { ShellFallback } from '@/components/shell-fallback'
import { EntrySkeleton } from './skeleton'

/** The entry form's shell while it renders. Title mirrors page.tsx exactly. */
export default function CatatLoading() {
  return (
    <ShellFallback
      title="Catat transaksi"
      current="/catat"
    >
      <EntrySkeleton />
    </ShellFallback>
  )
}
