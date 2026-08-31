import { signOut } from '@/app/login/actions'
import { MobileTabs } from '@/components/mobile-tabs'
import { NavHint } from '@/components/nav-hint'
import { ShellFrame } from '@/components/shell-frame'
import { countUnconfirmed } from '@/lib/queries/household'
import type { NavHref } from '@/components/nav'

/**
 * The frame every signed-in page sits in.
 *
 * From the small breakpoint up, navigation is a plain row of links rather than
 * a sidebar. Even at eight destinations a sidebar would be furniture rather
 * than orientation. The current page is marked with `aria-current` and a border
 * rather than colour alone, so it is legible to a screen reader and to anyone
 * who cannot separate the accent from the ink.
 *
 * Below it, that row is replaced by a bar pinned to the bottom of the screen.
 *
 * This reverses what stood here before, which argued the row was right on a
 * phone too because it wrapped where a sidebar would have had to become a menu
 * behind a button. Wrapping is what turned out to be the cost: eight links wrap
 * to three or four lines at 375px, and with the account row and the heading
 * above them the header spent most of the first screen before a single figure
 * appeared.
 *
 * The reasoning that produced the old decision still holds, and the bar keeps
 * it. What it refused was orientation hidden behind a button, not a bottom bar:
 * five destinations stay visible at all times, and only the four periodic ones
 * sit behind a tab that is itself always on screen. Two of those already lived
 * in the footer on the same argument.
 *
 * Settings is used twice a year and a permanent tab for that costs every other
 * page a little attention, so it stays in the footer beside the invitation
 * link. And a single transaction has no tab at all: it is reached from wherever
 * it was seen.
 *
 * The markup itself lives in `ShellFrame`, shared with the route-level loading
 * shells so a navigation never swaps one frame for a slightly different one.
 */

interface Props {
  title: string
  email: string
  current: NavHref
  lead?: string
  children: React.ReactNode
}

export function AppShell({ title, email, current, lead, children }: Props) {
  /*
    Started, not awaited. Most pages render this shell before their data, so
    that the frame paints while the figures are still being fetched, and a
    badge worth having is not worth holding the whole page for. The promise
    streams to the tab bar, where a Suspense boundary the size of the badge
    reads it; until it lands, and anywhere it cannot land, there is simply no
    badge.
  */
  const review = countUnconfirmed()

  return (
    <ShellFrame
      title={title}
      current={current}
      lead={lead}
      account={
        <form action={signOut} className="hidden items-baseline gap-3 sm:flex">
          <span className="text-sm text-ink-muted">{email}</span>
          <button
            type="submit"
            className="rounded-sm border border-line px-3 py-1.5 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
          >
            Keluar
          </button>
        </form>
      }
      tabs={<MobileTabs current={current} email={email} review={review} />}
      navHint={<NavHint className="ml-1.5" />}
    >
      {children}
    </ShellFrame>
  )
}
