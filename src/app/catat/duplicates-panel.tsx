'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { keepBoth, mergeDuplicate } from './actions'
import type { DuplicateView } from './duplicates-view'
import type { ActionResult } from '@/lib/actions'

/**
 * Manual entries that look like rows the bank later reported.
 *
 * Two rows for one movement is the failure a manual-entry feature invites, and
 * the only honest fix is to show both and let a person say. The bank row is
 * the one kept when they are merged, because it is the one the running balance
 * is reconciled against; what moves across is the category and the note, which
 * are the parts only a person knew.
 */

function Result({ result }: { result: ActionResult | null }) {
  if (!result) return null
  return (
    <p
      role="status"
      aria-live="polite"
      className={`mt-2 border px-3 py-2 text-sm text-ink ${
        result.ok ? 'border-under/40 bg-under-wash' : 'border-over/40 bg-over-wash'
      }`}
    >
      {result.message}
      {result.detail ? <span className="mt-0.5 block text-ink-muted">{result.detail}</span> : null}
    </p>
  )
}

function Action({
  label,
  ariaLabel,
  primary = false,
}: {
  label: string
  ariaLabel: string
  primary?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={ariaLabel}
      className={
        primary
          ? 'h-11 rounded-sm bg-accent px-4 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent-strong disabled:opacity-50'
          : 'h-11 border border-line-strong px-3 text-sm text-ink transition-colors duration-150 hover:bg-sunken disabled:opacity-50'
      }
    >
      {pending ? 'Menyimpan' : label}
    </button>
  )
}

export function DuplicatesPanel({ pairs }: { pairs: DuplicateView[] }) {
  const [mergeResult, merge] = useActionState<ActionResult | null, FormData>(mergeDuplicate, null)
  const [keepResult, keep] = useActionState<ActionResult | null, FormData>(keepBoth, null)

  if (pairs.length === 0) return null

  return (
    <section
      id="kemungkinan-ganda"
      aria-labelledby="kemungkinan-ganda-judul"
      className="border border-warn/40 bg-warn-wash p-4"
    >
      <h2 id="kemungkinan-ganda-judul" className="text-sm font-medium text-ink">
        <span aria-hidden="true" className="mr-1.5 text-warn">
          ◆
        </span>
        {pairs.length} catatan manual kemungkinan sama dengan baris dari bank
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Nominal dan akunnya sama, selisih waktunya di bawah tiga hari. Sampai kamu memutuskan,
        keduanya tetap terhitung.
      </p>

      <Result result={mergeResult} />
      <Result result={keepResult} />

      <ul className="mt-3 space-y-3">
        {pairs.map((pair) => (
          <li key={pair.manualId} className="border border-line bg-surface">
            <div
              className="relative overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label={`Catatan manual dan baris bank untuk ${pair.manual.description}`}
            >
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Catatan manual dan baris bank yang diduga sama
                </caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Sumber
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Waktu
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Keterangan
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Kategori
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Nominal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Manual', pair.manual],
                      ['Bank', pair.imported],
                    ] as const
                  ).map(([label, row]) => (
                    <tr key={label} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-normal text-ink">
                        {label}
                      </th>
                      <td className="tnum whitespace-nowrap px-4 py-2.5 text-ink-muted">
                        {row.when}
                      </td>
                      <td className="px-4 py-2.5 text-ink">
                        {row.description}
                        {row.note ? (
                          <span className="block text-xs text-ink-muted">{row.note}</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                        {row.categoryName}
                        {row.confirmed ? ' (sudah dipastikan)' : ''}
                      </td>
                      <td className="tnum whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink">
                        {row.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
              <span className="mr-auto text-xs text-ink-muted">Selisih waktu {pair.drift}</span>
              <form action={merge}>
                <input type="hidden" name="manualId" value={pair.manualId} />
                <input type="hidden" name="importedId" value={pair.importedId} />
                <Action
                  label="Gabungkan"
                  ariaLabel={`Gabungkan ${pair.manual.description}`}
                  primary
                />
              </form>
              <form action={keep}>
                <input type="hidden" name="manualId" value={pair.manualId} />
                <input type="hidden" name="importedId" value={pair.importedId} />
                <Action
                  label="Bukan yang sama"
                  ariaLabel={`Bukan yang sama: ${pair.manual.description}`}
                />
              </form>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-ink-muted">
        Gabungkan memakai baris dari bank dan memindahkan kategori serta catatan manualnya ke sana.
        Bukan yang sama menyimpan keduanya sebagai dua transaksi berbeda.
      </p>
    </section>
  )
}
