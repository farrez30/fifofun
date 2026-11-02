import { ShellFallback } from '@/components/shell-fallback'
import { QueueSkeleton } from './skeleton'

/** The queue's shell while it renders. Title mirrors page.tsx exactly. */
export default function TinjauLoading() {
  return (
    <ShellFallback
      title="Tinjau kategori"
      current="/tinjau"
    >
      <QueueSkeleton />
    </ShellFallback>
  )
}
