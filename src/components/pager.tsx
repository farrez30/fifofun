import Link from 'next/link'
import { CaretLeft } from '@phosphor-icons/react/dist/ssr/CaretLeft'
import { CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight'
import { NavHint } from '@/components/nav-hint'
import { pageWindow } from '@/lib/paging'

/**
 * Pages of a list, numbered.
 *
 * Numbers rather than only Sebelumnya and Berikutnya, because the reason to
 * page a list is to get somewhere in it: the last page of the places is where
 * the one-visit warungs are, and walking there one page at a time is the long
 * scroll again in another shape. `pageWindow` decides which numbers earn a
 * button; both ends are always one tap away.
 *
 * Back and forward sit in fixed slots at the two ends, an invisible stand-in
 * holding the place of the one that does not apply, so neither moves between
 * pages and a thumb finds them where it left them. On a phone the numbers give
 * way to "5 / 104": seven 44px numbers and two arrows were wider than the
 * screen and pushed Berikutnya under Sebelumnya.
 *
 * Links when the page lives in the address bar (the report, the map's places),
 * so the back button undoes a page and a page can be sent; buttons when the
 * list is a client island's own (the merchants still waiting, which are
 * searched in the browser).
 */

type Props = {
  page: number
  pages: number
  /** What is being paged, read out as the landmark: "Halaman daftar tempat". */
  label: string
} & ({ hrefFor: (page: number) => string; onPage?: never } | { onPage: (page: number) => void; hrefFor?: never })

const STEP =
  'inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-sm bg-fill-tertiary px-2.5 text-subhead font-medium text-ink transition-colors duration-150 hover:bg-fill-secondary'
const NUMBER =
  'tnum inline-flex size-11 items-center justify-center rounded-sm font-mono text-subhead text-ink-muted transition-colors duration-150 hover:bg-fill-tertiary hover:text-ink'
const CURRENT = 'tnum inline-flex size-11 items-center justify-center rounded-sm bg-fill-tertiary font-mono text-subhead font-semibold text-ink'

export function Pager({ page, pages, label, hrefFor, onPage }: Props) {
  if (pages <= 1) return null

  const go = (target: number, className: string, children: React.ReactNode, extra: { rel?: string; 'aria-label'?: string } = {}) =>
    hrefFor ? (
      <Link href={hrefFor(target)} className={className} {...extra}>
        {children}
        <NavHint className="absolute right-1 top-1" />
      </Link>
    ) : (
      <button type="button" onClick={() => onPage(target)} className={className} aria-label={extra['aria-label']}>
        {children}
      </button>
    )

  const back = (
    <>
      <CaretLeft aria-hidden="true" className="size-4" />
      <span className="sr-only sm:not-sr-only">Sebelumnya</span>
    </>
  )
  const forward = (
    <>
      <span className="sr-only sm:not-sr-only">Berikutnya</span>
      <CaretRight aria-hidden="true" className="size-4" />
    </>
  )
  // Same size as the step it stands in for, invisible and out of the tree.
  const placeholder = (content: React.ReactNode) => (
    <span aria-hidden="true" className={`${STEP} invisible`}>
      {content}
    </span>
  )

  return (
    <nav aria-label={label} className="mt-3">
      <div className="flex items-center justify-between gap-2">
        {page > 1 ? go(page - 1, `${STEP} relative`, back, { rel: 'prev' }) : placeholder(back)}

        <ol className="hidden items-center gap-0.5 sm:flex">
          {pageWindow(page, pages).map((n, index) =>
            n === null ? (
              <li key={`gap-${index}`} aria-hidden="true" className="inline-flex w-6 justify-center text-subhead text-ink-faint">
                …
              </li>
            ) : (
              <li key={n}>
                {n === page ? (
                  <span aria-current="page" className={CURRENT}>
                    <span className="sr-only">Halaman </span>
                    {n}
                  </span>
                ) : (
                  go(n, `${NUMBER} relative`, n, { 'aria-label': `Halaman ${n}` })
                )}
              </li>
            ),
          )}
        </ol>

        <p className="tnum font-mono text-subhead text-ink sm:hidden">
          <span className="sr-only">Halaman </span>
          {page}
          <span aria-hidden="true"> / </span>
          <span className="sr-only"> dari </span>
          {pages}
        </p>

        {page < pages ? go(page + 1, `${STEP} relative`, forward, { rel: 'next' }) : placeholder(forward)}
      </div>
      <p className="mt-1 hidden text-center text-footnote text-ink-muted sm:block">
        Halaman {page} dari {pages}
      </p>
    </nav>
  )
}
