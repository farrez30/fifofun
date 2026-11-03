import Link from 'next/link'
import { CaretLeft } from '@phosphor-icons/react/dist/ssr/CaretLeft'
import type { Back } from '@/lib/back'

/**
 * The way out of a page one level in, above its title.
 *
 * Labelled with the page it returns to rather than "Kembali", the way a
 * navigation bar's back button is on the phone this is mostly used on: the
 * label is the answer to "where does this go". A screen reader hears the verb
 * as well, since a bare "Laporan" link reads like a jump to a tab.
 */
export function BackLink({ back }: { back: Back }) {
  return (
    <Link
      href={back.href}
      data-back
      className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-accent transition-colors duration-150 hover:text-accent-strong"
    >
      <CaretLeft aria-hidden="true" weight="bold" className="size-4 shrink-0" />
      <span className="sr-only">Kembali ke </span>
      {back.label}
    </Link>
  )
}
