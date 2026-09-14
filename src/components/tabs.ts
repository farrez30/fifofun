import type { Icon } from '@phosphor-icons/react'
import { ChartPieSlice } from '@phosphor-icons/react/dist/ssr/ChartPieSlice'
import { CloudArrowUp } from '@phosphor-icons/react/dist/ssr/CloudArrowUp'
import { Coins } from '@phosphor-icons/react/dist/ssr/Coins'
import { Gear } from '@phosphor-icons/react/dist/ssr/Gear'
import { ListChecks } from '@phosphor-icons/react/dist/ssr/ListChecks'
import { NotePencil } from '@phosphor-icons/react/dist/ssr/NotePencil'
import { Receipt } from '@phosphor-icons/react/dist/ssr/Receipt'
import { Target } from '@phosphor-icons/react/dist/ssr/Target'
import { UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree'
import { Wallet } from '@phosphor-icons/react/dist/ssr/Wallet'
import type { NavHref } from '@/components/nav'

/**
 * What the phone's tab bar holds, named once — the same argument that moved
 * `NAV` out of the shell. The interactive bar is a client component and the
 * route-level loading shells are server components; both must draw the same
 * four tabs, and a client module's exports are not readable from a server
 * file, so the list lives here where either side can import it.
 */

export interface Tab {
  href: NavHref
  label: string
  glyph: Icon
}

/*
  Five is the ceiling. At 375px a sixth tab puts "Ringkasan" under 60px, which
  is narrower than the word.
*/
export const TABS: readonly Tab[] = [
  { href: '/', label: 'Ringkasan', glyph: ChartPieSlice },
  { href: '/laporan', label: 'Laporan', glyph: Receipt },
  { href: '/catat', label: 'Catat', glyph: NotePencil },
  // Catat and Tinjau are the two screens with work in them: one puts a row in,
  // the other decides what a row is. A budget is set once a month and read from
  // the summary for the rest of it, so it reaches further than a thumb should
  // have to.
  { href: '/tinjau', label: 'Tinjau', glyph: ListChecks },
] as const

/** Everything the bar has no room for, in the order it is reached for. */
export const SHEET: readonly Tab[] = [
  { href: '/anggaran', label: 'Anggaran', glyph: Wallet },
  { href: '/dana', label: 'Dana', glyph: Coins },
  { href: '/rencana', label: 'Rencana', glyph: Target },
  { href: '/impor', label: 'Impor', glyph: CloudArrowUp },
  { href: '/pengaturan', label: 'Pengaturan', glyph: Gear },
  { href: '/undangan', label: 'Undangan', glyph: UsersThree },
] as const

/*
  The pressed state, which carries more weight here than it looks.

  `active:` restores the feedback the global tap-highlight removal took away, so
  the finger sees the tab acknowledge it was hit. On iOS that is not a nicety:
  there is no Vibration API in any browser on the platform and there never has
  been, so on an iPhone the visual press is the only sensory feedback a tap can
  produce at all.

  A fill rather than `bg-sunken`, because the bar is glass now and an opaque
  press state punches an opaque hole through it. A fill composites against
  whatever the bar happens to be sampling, which is the whole reason Apple keeps
  a fill ladder separate from its backgrounds.

  And the control shrinks under the finger rather than growing. A press is being
  reported, not an invitation.
*/
export const TAB =
  'relative flex h-16 flex-1 flex-col items-center justify-center gap-1 transition-[color,background-color,transform] duration-150 ease-press active:scale-[0.97] active:bg-fill-quaternary'
