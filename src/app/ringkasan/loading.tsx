import { ShellFallback } from '@/components/shell-fallback'
import { LEAD, TITLE } from './copy'
import { SummarySkeleton } from './skeleton'

/** The summary's shell while it renders. Title and lead come from the same place as page.tsx. */
export default function RingkasanLoading() {
  return (
    <ShellFallback title={TITLE} current="/ringkasan" lead={LEAD}>
      <SummarySkeleton />
    </ShellFallback>
  )
}
