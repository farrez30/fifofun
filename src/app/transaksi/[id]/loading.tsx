import { ShellFallback } from '@/components/shell-fallback'
import { EntryDetailSkeleton } from './skeleton'

/** A transaction detail's shell while it renders. Title mirrors page.tsx exactly. */
export default function TransaksiLoading() {
  return (
    <ShellFallback
      title="Ubah transaksi"
      current="/transaksi"
    >
      <EntryDetailSkeleton />
    </ShellFallback>
  )
}
