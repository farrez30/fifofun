'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { SegmentNav, type Segment } from '@/components/segment-nav'

/**
 * The views of a split page, switched in place.
 *
 * The map and the report load everything their views show in one request: the
 * places, the merchants still waiting, the breakdowns. Switching between them
 * used to be a round trip to render what the browser already held, so every
 * view is rendered once, the closed ones `hidden`, and a tap only changes
 * which one shows. The address still follows (pushState, and popstate for
 * Back), so a view can be sent and reopened, and the links underneath work
 * before hydration.
 *
 * A filter form elsewhere on the page names itself in `form`, and the open
 * view rides along as a hidden field associated with it by id: applying a
 * filter keeps the view that was open, not the one the page was loaded on.
 */
export function ViewSwitch({
  label,
  segments,
  initial,
  form,
  header,
  views,
}: {
  /** The landmark's name, e.g. "Bagian peta". */
  label: string
  segments: Segment[]
  /** The view the server rendered as open, from `?bagian=`. */
  initial: string
  /** The id of the page's filter form. */
  form?: string
  /** What every view shares, drawn between the segments and the open view. */
  header?: ReactNode
  views: Record<string, ReactNode>
}) {
  const keys = segments.map((segment) => segment.key)
  const first = keys[0]
  const [current, setCurrent] = useState(initial)

  const keyList = keys.join('|')
  useEffect(() => {
    const known = keyList.split('|')
    const onPop = () => {
      const asked = new URLSearchParams(window.location.search).get('bagian') ?? ''
      setCurrent(known.includes(asked) ? asked : known[0])
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [keyList])

  const choose = (key: string) => {
    if (key === current) return
    setCurrent(key)
    const href = segments.find((segment) => segment.key === key)?.href
    if (href) window.history.pushState(null, '', href)
  }

  return (
    <>
      <SegmentNav label={label} segments={segments} current={current} onSelect={choose} />
      {form && current !== first ? <input type="hidden" name="bagian" value={current} form={form} /> : null}
      {header}
      {Object.entries(views).map(([key, view]) => (
        <div key={key} hidden={key !== current} data-view={key}>
          {view}
        </div>
      ))}
    </>
  )
}
