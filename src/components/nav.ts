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

/**
 * Where this application can be navigated to, named once.
 *
 * Split out of `app-shell.tsx` when the phone got a second navigation. The
 * shell is a server component holding a server action, so a client component
 * that imported the list from it would pull the action across the boundary for
 * the sake of eight strings. The list itself needs neither, so it lives here
 * and both sides read the same one.
 *
 * The alternative was a second copy of the routes in the tab bar, which is how
 * a renamed page keeps working in one navigation and 404s in the other.
 *
 * The icon travels with the route now too, since the desktop sidebar draws
 * one for every destination and `src/components/tabs.ts` derives its own
 * (smaller) lists from these two arrays rather than keeping a second, separate
 * set of glyph choices that could quietly drift from this one.
 */

export interface Destination {
  href: string
  label: string
  glyph: Icon
}

export const NAV = [
  { href: '/', label: 'Ringkasan', glyph: ChartPieSlice },
  { href: '/laporan', label: 'Laporan', glyph: Receipt },
  { href: '/dana', label: 'Dana', glyph: Coins },
  { href: '/anggaran', label: 'Anggaran', glyph: Wallet },
  { href: '/tinjau', label: 'Tinjau', glyph: ListChecks },
  { href: '/catat', label: 'Catat', glyph: NotePencil },
  { href: '/rencana', label: 'Rencana', glyph: Target },
  { href: '/impor', label: 'Impor', glyph: CloudArrowUp },
] as const satisfies readonly Destination[]

/**
 * The two destinations that live in the footer on desktop and the sheet on a
 * phone: used a few times a year, so a permanent slot for either would cost
 * every other page a little attention for nothing most visits.
 */
export const MORE = [
  { href: '/pengaturan', label: 'Pengaturan', glyph: Gear },
  { href: '/undangan', label: 'Undangan', glyph: UsersThree },
] as const satisfies readonly Destination[]

/**
 * Which nav item is the current page.
 *
 * A route that sits outside the navigation passes its own href and nothing
 * highlights, which is the truthful answer.
 */
export type NavHref =
  | (typeof NAV)[number]['href']
  | (typeof MORE)[number]['href']
  | '/transaksi'
