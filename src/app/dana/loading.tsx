import { ShellFallback } from '@/components/shell-fallback'
import { FundsSkeleton } from './skeleton'

/** The funds page's shell while it renders. Title mirrors page.tsx exactly. */
export default function DanaLoading() {
  return (
    <ShellFallback
      title="Dana"
      current="/dana"
    >
      <FundsSkeleton />
    </ShellFallback>
  )
}
