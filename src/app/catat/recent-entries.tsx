'use client'

import { useActionState } from 'react'
import { DirectionMark } from '@/components/marks'
import type { Direction } from '@/lib/ledger/direction'
import { deleteEntry } from './actions'
import type { ActionResult } from '@/lib/actions'

/**
 * The last ten rows a person typed here.
 *
 * Enough to see that a save landed and to undo a mistake made a minute ago,
 * and not so many that the page becomes a second ledger. Everything arrives
 * already formatted: this island holds no bigint and does no arithmetic.
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

export function RecentEntries({ rows }: { rows: RecentEntry[] }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(deleteEntry, null)

  if (rows.length === 0) {
    return (
      <div className="border border-line bg-surface p-6">
        <p className="text-sm font-medium text-ink">Belum ada catatan manual.</p>
        <p className="mt-2 text-sm text-ink-muted">
          Catatan pertama muncul di sini setelah disimpan, dan bisa dihapus dari sini juga.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {result ? (
        <p
          role="status"
          aria-live="polite"
          className={`border px-3 py-2 text-sm text-ink ${
            result.ok ? 'border-under/40 bg-under-wash' : 'border-over/40 bg-over-wash'
          }`}
        >
          {result.message}
          {result.detail ? <span className="mt-0.5 block text-ink-muted">{result.detail}</span> : null}
        </p>
      ) : null}

      <div
        className="relative overflow-x-auto border border-line bg-surface"
        tabIndex={0}
        role="region"
        aria-label="Tabel catatan manual terakhir, bisa digeser ke samping"
      >
        <table className="w-full text-sm">
          <caption className="sr-only">Sepuluh catatan manual terakhir</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
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
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="tnum whitespace-nowrap px-4 py-2.5 text-ink-muted">{row.when}</td>
                <th scope="row" className="px-4 py-2.5 text-left font-normal text-ink">
                  <a
                    href={`/transaksi/${row.id}`}
                    className="underline underline-offset-2 hover:text-accent"
                  >
                    {row.description}
                  </a>
                  {row.duplicateSuspected ? (
                    <a
                      href="/tinjau#kemungkinan-ganda"
                      className="ml-2 inline-block rounded-xs border border-warn/40 bg-warn-wash px-1.5 py-0.5 text-xs text-ink"
                    >
                      kemungkinan ganda
                    </a>
                  ) : null}
                </th>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{row.categoryName}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{row.account}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <span className="inline-flex items-center gap-1">
                    <DirectionMark direction={row.direction} />
                    <span className="tnum font-mono text-ink">{row.amount}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <form action={action} className="inline">
                    <input type="hidden" name="transactionId" value={row.id} />
                    <button
                      type="submit"
                      aria-label={`Hapus ${row.description}`}
                      className="h-11 border border-line-strong px-3 text-sm text-ink transition-colors duration-150 hover:bg-sunken"
                    >
                      Hapus
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-muted">
        Menghapus hanya menyembunyikan barisnya dari semua hitungan; datanya tetap ada. Klik
        keterangannya untuk mengubah nominal, tanggal, atau kategorinya.
      </p>
    </div>
  )
}
