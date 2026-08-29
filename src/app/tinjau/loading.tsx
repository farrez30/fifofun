import { ShellFallback } from '@/components/shell-fallback'
import { QueueSkeleton } from './skeleton'

/** The queue's shell while it renders. Title and lead mirror page.tsx exactly. */
export default function TinjauLoading() {
  return (
    <ShellFallback
      title="Tinjau kategori"
      current="/tinjau"
      lead="Kategori dari impor adalah tebakan mesin. Di sini kamu yang memutuskan, dan keputusanmu berlaku ke transaksi berikutnya."
    >
      <QueueSkeleton />
    </ShellFallback>
  )
}
