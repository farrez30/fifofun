'use client'

import { useEffect, useState } from 'react'

/**
 * Where you are in the plan, and how to get somewhere else in it.
 *
 * Six sections on one page is a document, and a document with no table of
 * contents is read by scrolling and remembering. The pills are ordinary
 * anchors, so they work before the JavaScript arrives and land correctly
 * because every section clears the dock with its own scroll margin.
 *
 * Which one is current is decided by what is in the upper fifth of the
 * viewport rather than by whatever was clicked last. Those two answers
 * disagree the moment somebody scrolls after clicking, and only one of them is
 * about where the reader actually is.
 */

export interface PlanSection {
  id: string
  label: string
}

export function PlanIndex({ sections }: { sections: PlanSection[] }) {
  const [current, setCurrent] = useState(sections[0]?.id ?? '')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const seen = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) seen.add(entry.target.id)
          else seen.delete(entry.target.id)
        }
        // Two sections can straddle the band at once. The earlier one wins,
        // because that is the heading a reader has most recently passed.
        const active = sections.find((section) => seen.has(section.id))
        if (active) setCurrent(active.id)
      },
      { rootMargin: '-20% 0px -70% 0px' },
    )

    for (const section of sections) {
      const node = document.getElementById(section.id)
      if (node) observer.observe(node.closest('section') ?? node)
    }
    return () => observer.disconnect()
  }, [sections])

  return (
    <nav aria-label="Bagian rencana">
      <ul className="flex gap-1 overflow-x-auto">
        {sections.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={current === section.id ? 'location' : undefined}
              className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-xs transition-colors duration-150 ${
                current === section.id
                  ? 'bg-accent-wash text-ink'
                  : 'text-ink-muted hover:bg-sunken hover:text-ink'
              }`}
            >
              {/* Quieter than the label, but still legible on the wash the
                  current pill is painted with. */}
              <span aria-hidden="true" className="tnum font-mono text-ink-muted">
                {String(index + 1).padStart(2, '0')}
              </span>
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
