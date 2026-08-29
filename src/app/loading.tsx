import { ShellFallback } from '@/components/shell-fallback'
import { DashboardSkeleton } from './skeleton'

/**
 * What a navigation to `/` shows before the page's own render lands.
 *
 * Without a loading file a route inherits nothing here and the whole viewport
 * blanks between pages, which reads as the browser reloading even though it
 * never does. The shell repaints the chrome statically and the skeleton holds
 * the destination's shape; the in-page `<Suspense key={akun}>` boundaries stay,
 * because a searchParams-only navigation does not re-trigger this file.
 *
 * A route without its own loading file inherits the nearest one up the tree —
 * which is this one. For /impor and /undangan that is close enough (same
 * chrome, generic shape); /login and /legal/* do not use the shell at all, but
 * they are reached by redirect or hard navigation, where this never shows.
 */
export default function HomeLoading() {
  return (
    <ShellFallback title="Ringkasan" current="/">
      <DashboardSkeleton />
    </ShellFallback>
  )
}
