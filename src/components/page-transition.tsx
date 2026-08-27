import { ViewTransition } from 'react'
import type { ReactNode } from 'react'

/**
 * The page crossfades, or slides where a thumb said which way.
 *
 * Nothing is installed for this. React names the pair and the browser animates
 * it; the timing and the direction are four rules in `globals.css`.
 *
 * The guard is not defensive coding for its own sake. `ViewTransition` ships in
 * the React that the App Router bundles, not in the `react` package in
 * node_modules, and the same import resolves to a different one depending on
 * who is rendering. The fixture harness renders components outside Next with
 * the latter, where this is undefined, and a static page with no navigation in
 * it has nothing to animate anyway. A browser too old for the View Transitions
 * API takes the same path for the same reason: the content swaps, which is the
 * correct fallback and costs nothing.
 *
 * It lives in the shell rather than in each of the eleven pages, and that only
 * works because the shell is not a layout: every page renders its own, so this
 * unmounts and remounts on navigation. A layout would persist and never fire.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  if (!ViewTransition) return children

  return (
    <ViewTransition
      name="page-content"
      /*
        A swipe carries its direction here so the CSS can tell it from a tap.
        `default` is the plain crossfade everything else gets.
      */
      share={{
        'swipe-next': 'swipe-next',
        'swipe-prev': 'swipe-prev',
        default: 'page-swap',
      }}
    >
      {children}
    </ViewTransition>
  )
}
