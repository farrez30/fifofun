'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { CaretRight } from '@phosphor-icons/react/dist/ssr/CaretRight'
import { NotePencil } from '@phosphor-icons/react/dist/ssr/NotePencil'
import { SubmitButton } from '@/components/submit-button'
import { DirectionMark } from '@/components/marks'
import { SwipeActionRow, TrayDelete } from '@/components/swipe-action-row'
import type { Direction } from '@/lib/ledger/direction'
import { deleteEntry } from './actions'
import type { ActionResult } from '@/lib/actions'
import { BUTTON_PLAIN } from '@/components/field-base'
import { Unavailable } from '@/components/unavailable'
import { useActionToast } from '@/components/use-action-toast'

/**
 * The last few rows a person typed here.
 *
 * Five, not ten: enough to see that a save landed and to undo a mistake made
 * a minute ago. Every manual row is one tap away in Laporan, filtered to
 * "Dicatat manual" and paged, so this list never has to become a second
 * ledger under the form.
 *
 * Delete used to be a full button on its own line under every card, which
 * made each card twice as tall as its content. It now lives where the
 * ledger's own cards keep it: behind a swipe on a phone (with Ubah beside it,
 * and the whole card still a link to the detail page that can do both), and
 * as a plain row action in the table. Everything arrives already formatted:
 * this island holds no bigint and does no arithmetic.
 */

export interface RecentEntry {
  id: string
  when: string
  description: string
  categoryName: string
  account: string
  amount: string
  direction: Direction
  /** The import found a bank row that looks like this one. */
  duplicateSuspected: boolean
}

export const SHOWN = 5

export function RecentEntries({ rows, total }: { rows: RecentEntry[]; total: number }) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(deleteEntry, null)
  useActionToast(result, pending, 'Menghapus…')

  if (rows.length === 0) {
    return (
      <Unavailable glyph={NotePencil} title="Belum ada catatan manual">
        Catatan pertama muncul di sini setelah disimpan, dan bisa dihapus dari sini juga.
      </Unavailable>
    )
  }

  const shown = rows.slice(0, SHOWN)

  return (
    <div className="@container space-y-2">
      <ul
        aria-label="Catatan manual terakhir"
        className="rows-inset squircle rounded-md bg-surface shadow-xs @5xl:hidden"
      >
        {shown.map((row) => (
          <li key={row.id}>
            <SwipeActionRow
              actions={
                <>
                  <Link
                    href={`/transaksi/${row.id}`}
                    className="flex h-full min-w-20 items-center justify-center border-l border-line bg-sunken px-4 text-subhead font-medium text-ink"
                  >
                    Ubah
                    <span className="sr-only"> {row.description}</span>
                  </Link>
                  <TrayDelete id={row.id} description={row.description} />
                </>
              }
            >
              <Link
                href={`/transaksi/${row.id}`}
                className="flex min-h-14 items-center gap-2 px-3 py-2.5 transition-colors duration-150 hover:bg-sunken"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-subhead text-ink">{row.description}</span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <DirectionMark direction={row.direction} />
                      <span className="tnum font-mono text-subhead text-ink">{row.amount}</span>
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-footnote text-ink-muted">
                    <span className="tnum">{row.when}</span>
                    <span aria-hidden="true" className="text-ink-faint">
                      ·
                    </span>
                    <span className="min-w-0 truncate">{row.categoryName}</span>
                    <span aria-hidden="true" className="text-ink-faint">
                      ·
                    </span>
                    <span className="min-w-0 truncate">{row.account}</span>
                  </p>
                  {/* A label inside the card rather than a link of its own: a
                      link inside a link is not a thing a tap can mean. The
                      detail page and Tinjau both carry the pairing. */}
                  {row.duplicateSuspected ? (
                    <span className="mt-1.5 inline-block rounded-xs border border-warn/40 bg-warn-wash px-1.5 py-0.5 text-caption2 text-ink">
                      kemungkinan ganda
                    </span>
                  ) : null}
                </div>
                <CaretRight aria-hidden="true" className="size-4 shrink-0 text-ink-faint" />
              </Link>
            </SwipeActionRow>
          </li>
        ))}
      </ul>

      <div
        className="relative hidden overflow-x-auto squircle rounded-md bg-surface shadow-xs @5xl:block"
        tabIndex={0}
        role="region"
        aria-label="Tabel catatan manual terakhir, bisa digeser ke samping"
      >
        <table className="w-full text-subhead">
          <caption className="sr-only">Catatan manual terakhir</caption>
          <thead>
            <tr className="border-b border-line text-left text-caption1 uppercase tracking-wide text-ink-faint">
              <th scope="col" className="px-4 py-2.5 font-medium">
                Waktu
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Keterangan
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Kategori
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Akun
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Nominal
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                <span className="sr-only">Tindakan</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="tnum whitespace-nowrap px-4 py-2 text-ink-muted">{row.when}</td>
                <th scope="row" className="px-4 py-2 text-left font-normal text-ink">
                  <a href={`/transaksi/${row.id}`} className="underline underline-offset-2 hover:text-accent">
                    {row.description}
                  </a>
                  {row.duplicateSuspected ? (
                    <a
                      href="/tinjau#kemungkinan-ganda"
                      className="ml-2 inline-block rounded-xs border border-warn/40 bg-warn-wash px-1.5 py-0.5 text-caption2 text-ink"
                    >
                      kemungkinan ganda
                    </a>
                  ) : null}
                </th>
                <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{row.categoryName}</td>
                <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{row.account}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <span className="inline-flex items-center gap-1">
                    <DirectionMark direction={row.direction} />
                    <span className="tnum font-mono text-ink">{row.amount}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  {/* Its own form per row, so the hidden phone tree above can
                      never submit for it. */}
                  <form action={action} className="inline">
                    <input type="hidden" name="transactionId" value={row.id} />
                    <SubmitButton aria-label={`Hapus ${row.description}`} className={BUTTON_PLAIN}>
                      Hapus
                    </SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-footnote text-ink-muted">
          Menghapus hanya menyembunyikan barisnya dari semua hitungan. Di ponsel, geser kartunya ke
          kiri untuk Ubah atau Hapus.
        </p>
        {total > shown.length ? (
          <Link
            href="/laporan?sumber=manual"
            className="inline-flex min-h-11 items-center gap-1 text-subhead text-accent"
          >
            Lihat semua ({total})
            <CaretRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>
    </div>
  )
}
