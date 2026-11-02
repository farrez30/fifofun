import { ShellFallback } from '@/components/shell-fallback'
import { PlannerSkeleton } from './skeleton'

/** The planner's shell while it renders. Title mirrors page.tsx exactly. */
export default function RencanaLoading() {
  return (
    <ShellFallback
      title="Rencana"
      current="/rencana"
    >
      <PlannerSkeleton />
    </ShellFallback>
  )
}
