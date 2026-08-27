'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChartPieSlice } from '@phosphor-icons/react/dist/ssr/ChartPieSlice'
import { CloudArrowUp } from '@phosphor-icons/react/dist/ssr/CloudArrowUp'
import { Coins } from '@phosphor-icons/react/dist/ssr/Coins'
import { DotsThree } from '@phosphor-icons/react/dist/ssr/DotsThree'
import { Gear } from '@phosphor-icons/react/dist/ssr/Gear'
import { ListChecks } from '@phosphor-icons/react/dist/ssr/ListChecks'
import { NotePencil } from '@phosphor-icons/react/dist/ssr/NotePencil'
import { Receipt } from '@phosphor-icons/react/dist/ssr/Receipt'
import { SignOut } from '@phosphor-icons/react/dist/ssr/SignOut'
import { Target } from '@phosphor-icons/react/dist/ssr/Target'
import { UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree'
import { Wallet } from '@phosphor-icons/react/dist/ssr/Wallet'
import type { Icon } from '@phosphor-icons/react'
import { signOut } from '@/app/login/actions'
import type { NavHref } from '@/components/nav'

/**
 * The navigation a phone gets instead of the wrapping row of links.
 *
 * Eight links in a row wrap to three or four lines at 375px, and with the
 * account row and the heading above them the header spent most of the first
 * screen before any figure appeared. A bar pinned to the bottom costs a fixed
 * 64px, sits under the thumb rather than above it, and never moves.
 *
 * The four destinations that do not fit are not hidden behind a hamburger.
 * They are behind a tab that is itself always visible, and they are the
 * periodic ones: a fund is opened when a fund changes, a statement is imported
 * once a month, settings twice a year. Two of them already lived in the footer
 * for exactly that reason.
 *
 * The current tab is marked three ways and only one of them is colour: the
 * glyph fills, the label takes medium weight, and `aria-current` says so. The
 * accent is the least of the three on purpose.
 */

interface Tab {
  href: NavHref
  label: string
  glyph: Icon
}

/*
  Five is the ceiling. At 375px a sixth tab puts "Ringkasan" under 60px, which
  is narrower than the word.
*/
const TABS: readonly Tab[] = [
  { href: '/', label: 'Ringkasan', glyph: ChartPieSlice },
  { href: '/laporan', label: 'Laporan', glyph: Receipt },
  { href: '/catat', label: 'Catat', glyph: NotePencil },
  { href: '/anggaran', label: 'Anggaran', glyph: Wallet },
] as const

/** Everything the bar has no room for, in the order it is reached for. */
const SHEET: readonly Tab[] = [
  { href: '/tinjau', label: 'Tinjau', glyph: ListChecks },
  { href: '/dana', label: 'Dana', glyph: Coins },
  { href: '/rencana', label: 'Rencana', glyph: Target },
  { href: '/impor', label: 'Impor', glyph: CloudArrowUp },
  { href: '/pengaturan', label: 'Pengaturan', glyph: Gear },
  { href: '/undangan', label: 'Undang anggota', glyph: UsersThree },
] as const

const TAB = 'flex h-16 flex-1 flex-col items-center justify-center gap-1 transition-colors duration-150'

export function MobileTabs({ current, email }: { current: NavHref; email: string }) {
  const sheet = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const inSheet = SHEET.some((item) => item.href === current)

  /*
    Closing has to be observed rather than assumed. A dialog is dismissed by the
    Escape key and by the browser's own back gesture as well as by the button,
    and a flag set only where `close()` is called goes stale on both.
  */
  useEffect(() => {
    const node = sheet.current
    if (!node) return
    const sync = () => setOpen(node.open)
    node.addEventListener('close', sync)
    return () => node.removeEventListener('close', sync)
  }, [])

  /* A route change while the sheet is open leaves it covering the page it just
     navigated to. */
  useEffect(() => {
    sheet.current?.close()
  }, [current])

  return (
    <>
      <nav
        aria-label="Halaman utama"
        /* `sm:hidden` and not a media query in JavaScript: the bar must be
           absent on the first paint at desktop width, not removed after it. */
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-safe-b pl-safe-l pr-safe-r sm:hidden"
      >
        <ul className="flex">
          {TABS.map((tab) => (
            <li key={tab.href} className="flex flex-1">
              <Link
                href={tab.href}
                aria-current={tab.href === current ? 'page' : undefined}
                className={`${TAB} ${
                  tab.href === current ? 'text-accent' : 'text-ink-muted'
                }`}
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
            <button
              type="button"
              onClick={() => {
                sheet.current?.showModal()
                setOpen(true)
              }}
              aria-expanded={open}
              aria-haspopup="dialog"
              className={`${TAB} ${inSheet ? 'text-accent' : 'text-ink-muted'}`}
            >
              <DotsThree
                aria-hidden="true"
                weight={inSheet ? 'fill' : 'regular'}
                className="size-6 shrink-0"
              />
              <span className={`text-xs ${inSheet ? 'font-medium' : ''}`}>Lainnya</span>
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={sheet}
        aria-label="Lainnya"
        /* A dialog centres itself. `mt-auto mb-0` drops it to the bottom edge,
           where the hand that opened it already is. */
        className="mx-auto mb-0 mt-auto w-full max-w-none rounded-t-md border-t border-line bg-surface p-0 text-ink backdrop:bg-scrim sm:hidden"
        /* A click that lands on the dialog itself landed on the backdrop: every
           child covers its own area. */
        onClick={(event) => {
          if (event.target === sheet.current) sheet.current?.close()
        }}
      >
        <div className="pb-safe-b">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="truncate text-sm text-ink-muted">{email}</p>
            <button
              type="button"
              onClick={() => sheet.current?.close()}
              className="-mr-2 shrink-0 rounded-sm px-3 text-sm text-ink-muted transition-colors duration-150 hover:bg-sunken"
            >
              Tutup
            </button>
          </div>

          <nav aria-label="Halaman lainnya">
            <ul className="divide-y divide-line">
              {SHEET.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={item.href === current ? 'page' : undefined}
                    className={`flex min-h-14 items-center gap-3 px-4 text-sm transition-colors duration-150 hover:bg-sunken ${
                      item.href === current ? 'font-medium text-accent' : 'text-ink'
                    }`}
                  >
                    <item.glyph
                      aria-hidden="true"
                      weight={item.href === current ? 'fill' : 'regular'}
                      className="size-5 shrink-0 text-ink-muted"
                    />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <form action={signOut} className="border-t border-line">
            <button
              type="submit"
              className="flex min-h-14 w-full items-center gap-3 px-4 text-sm text-ink transition-colors duration-150 hover:bg-sunken"
            >
              <SignOut aria-hidden="true" weight="regular" className="size-5 shrink-0 text-ink-muted" />
              Keluar
            </button>
          </form>
        </div>
      </dialog>
    </>
  )
}
