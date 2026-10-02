import { ShellFallback } from '@/components/shell-fallback'
import { LEAD, TITLE } from './copy'
import { MapSkeleton } from './skeleton'

/** The map's shell while it renders. Title and lead come from the same place as page.tsx. */
export default function PetaLoading() {
  return (
    <ShellFallback title={TITLE} current="/peta" lead={LEAD}>
      <MapSkeleton />
    </ShellFallback>
  )
}
