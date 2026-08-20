'use client'

import { useActionState } from 'react'
import { setFundTarget, type ActionResult } from './actions'

/**
 * The one figure in this feature a person decides.
 *
 * Collapsed behind a summary rather than sitting open under every pot. Setting
 * a target is something that happens once and then not again for a year, and
 * eight open forms would bury the eight progress bars that are the point of
 * the page.
 */

interface Props {
  categoryId: string
  name: string
  /** The target in whole rupiah, or an empty string where none is set. */
  target: string
  /** `YYYY-MM`, or an empty string. */
  month: string
}

export function TargetForm({ categoryId, name, target, month }: Props) {
  const [result, action] = useActionState<ActionResult | null, FormData>(setFundTarget, null)

  return (
    <details className="mt-3 border-t border-line pt-2 text-xs">
      <summary className="cursor-pointer text-accent underline underline-offset-2">
        {target === '' ? 'Tetapkan target' : 'Ubah target'}
      </summary>

      <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="categoryId" value={categoryId} />

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Target (Rupiah)</span>
          <input
            type="number"
            name="amount"
            min={0}
            step={100_000}
            defaultValue={target}
            aria-label={`Target untuk ${name}, dalam Rupiah`}
            className="tnum h-11 w-40 border border-line bg-paper px-2 font-mono text-sm text-ink"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Dibutuhkan bulan</span>
          <input
            type="month"
            name="month"
            defaultValue={month}
            aria-label={`Bulan target untuk ${name}`}
            className="h-11 border border-line bg-paper px-2 text-sm text-ink"
          />
        </label>

        <button
          type="submit"
          className="h-11 border border-line-strong px-3 text-sm text-ink transition-colors duration-150 hover:bg-sunken"
        >
          Simpan
        </button>
      </form>

      <p className="mt-2 text-ink-faint">
        Kosongkan angkanya untuk menghapus target. Bulannya boleh dikosongkan kalau posnya tidak
        punya tenggat.
      </p>

      {result ? (
        <p className={`mt-1 ${result.ok ? 'text-under' : 'text-over'}`}>{result.message}</p>
      ) : null}
    </details>
  )
}
