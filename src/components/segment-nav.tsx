import Link from 'next/link'
import { NavHint } from '@/components/nav-hint'
import { SEGMENT, SEGMENT_ON, SEGMENTED } from '@/components/field-base'

/**
 * The views of a page that used to be one long scroll.
 *
 * The same segmented control as everywhere else (`SEGMENTED` in
 * `field-base.tsx`), as links: the view is in the address, so it needs no
 * JavaScript to switch, the back button undoes it, and a server page renders
 * only the view that is open. A count after a label says how much is behind it
 * without opening it.
 *
 * `onSelect` is for a client island whose views share state it cannot lose to
 * a navigation (the plan's figures): the link still carries the address, so it
 * works before hydration and opens in a new tab, and a plain click switches in
 * place instead.
 *
 * Full width on a phone, each view as wide as its label, like iOS; its natural
 * width from `sm` up. The focus ring is drawn inside the segment, because the
 * track scrolls sideways as a last resort and would clip a ring drawn outside.
 */

export interface Segment {
  key: string
  label: string
  count?: number
  href: string
}

export function SegmentNav({
  label,
  segments,
  current,
  onSelect,
}: {
  /** The landmark's name, e.g. "Bagian peta". */
  label: string
  segments: Segment[]
  current: string
  onSelect?: (key: string) => void
}) {
  return (
    <nav aria-label={label}>
      <ul className={`${SEGMENTED} w-full overflow-x-auto sm:w-auto`}>
        {segments.map((segment) => {
          const on = segment.key === current
          const className = `${SEGMENT} ${on ? SEGMENT_ON : ''} relative w-full whitespace-nowrap focus-visible:outline-offset-[-2px] max-sm:px-2`
          const body = (
            <>
              {segment.label}
              {segment.count !== undefined ? (
                // The label's own colour, set apart by size and figure style:
                // a fainter grey failed contrast on the track and on the
                // selected pill alike. The brackets are for the ear only, so
                // the name is "Menunggu (168)" and not "Menunggu168".
                <span className="tnum ml-1.5 font-mono text-caption1">
                  <span className="sr-only"> (</span>
                  {segment.count}
                  <span className="sr-only">)</span>
                </span>
              ) : null}
            </>
          )
          return (
            <li key={segment.key} className="flex-1 sm:flex-none">
              {onSelect ? (
                <a
                  href={segment.href}
                  aria-current={on ? 'page' : undefined}
                  onClick={(event) => {
                    // A modified click still opens the view in a new tab.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
                    event.preventDefault()
                    onSelect(segment.key)
                  }}
                  className={className}
                >
                  {body}
                </a>
              ) : (
                <Link href={segment.href} aria-current={on ? 'page' : undefined} className={className}>
                  {body}
                  {/* In the corner rather than after the label: four views share
                      343px on a phone, and a dot's width each was the overflow. */}
                  <NavHint className="absolute right-1 top-1" />
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
