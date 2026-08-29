import Link from 'next/link'
import { DotsNine } from '@phosphor-icons/react/dist/ssr/DotsNine'
import { ShellFrame } from '@/components/shell-frame'
import { SHEET, TAB, TABS } from '@/components/tabs'
import type { NavHref } from '@/components/nav'

/**
 * The frame a route's loading.tsx shows while the real page renders.
 *
 * Fully static on purpose, and that property is load-bearing twice over. A
 * loading file replaces the whole viewport during a navigation, so it must
 * repaint the chrome or the header and tab bar vanish and reappear — which
 * reads as a full reload even when no reload happened. And it must do so
 * without cookies, without the user, without the review count: runtime data
 * here would demote the shell to just another thing to wait for. Never add
 * user data to this file.
 *
 * The stand-ins keep the real chrome's geometry: a skeleton pill where the
 * email row goes, the same four tabs as live links (a user can retarget
 * mid-load), and an inert Lainnya button. The interactive bar with its sheet,
 * badge, swipe and pull-to-refresh costs a hydration this shell does not live
 * long enough to repay.
 */

function MobileTabsFallback({ current }: { current: NavHref }) {
  const inSheet = SHEET.some((item) => item.href === current)

  return (
    <nav
      aria-label="Halaman utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-safe-b pl-safe-l pr-safe-r sm:hidden"
    >
      <ul className="flex">
        {TABS.map((tab) => (
          <li key={tab.href} className="flex flex-1">
            <Link
              href={tab.href}
              aria-current={tab.href === current ? 'page' : undefined}
              className={`${TAB} ${tab.href === current ? 'text-accent' : 'text-ink-muted'}`}
            >
              <tab.glyph
                aria-hidden="true"
                weight={tab.href === current ? 'fill' : 'regular'}
                className="size-6 shrink-0"
              />
              <span className={`text-xs ${tab.href === current ? 'font-medium' : ''}`}>
                {tab.label}
              </span>
            </Link>
          </li>
        ))}

        <li className="flex flex-1">
          {/* The sheet needs the client component; until it hydrates the
              button is honest about doing nothing. */}
          <button
            type="button"
            disabled
            aria-disabled="true"
            aria-current={inSheet ? 'true' : undefined}
            className={`${TAB} ${inSheet ? 'text-accent' : 'text-ink-muted'}`}
          >
            <DotsNine
              aria-hidden="true"
              weight={inSheet ? 'fill' : 'regular'}
              className="size-6 shrink-0"
            />
            <span className={`text-xs ${inSheet ? 'font-medium' : ''}`}>Lainnya</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}

interface Props {
  title: string
  current: NavHref
  lead?: string
  children: React.ReactNode
}

export function ShellFallback({ title, current, lead, children }: Props) {
  return (
    <ShellFrame
      title={title}
      current={current}
      lead={lead}
      account={<div aria-hidden="true" className="skeleton hidden h-8 w-44 sm:block" />}
      tabs={<MobileTabsFallback current={current} />}
    >
      {children}
    </ShellFrame>
  )
}
