'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { formatIdr, formatIdrCompact } from '@/lib/money'
import { MATCH_LABELS, type MatchType, type ReviewGroup } from '@/lib/ledger/rules'
import { applyCategory, categoriseOne, type ActionResult } from './actions'

/**
 * The categorisation queue.
 *
 * Grouped by counterparty rather than listed by transaction, because the two are
 * not the same amount of work: this ledger's 220 uncategorised rows collapse into
 * 25 counterparties, and thirteen of those cover 208 rows. A per-transaction
 * queue asks for 220 decisions to reach where 13 decisions reach.
 *
 * The pattern is shown and editable rather than hidden behind the word "always".
 * A rule that quietly matches more than the person expected is the failure mode
 * of every system like this, and the only defence is letting them see it before
 * they agree to it.
 */

export interface CategoryOption {
  id: string
  name: string
  cashflow: string
}

interface Props {
  groups: ReviewGroup[]
  categories: CategoryOption[]
  /** Everything still waiting, so progress is a fraction rather than a feeling. */
  remaining: { count: number; total: bigint }
}

export function ReviewQueue({ groups, categories, remaining }: Props) {
  const [open, setOpen] = useState<string | null>(groups[0]?.pattern ?? null)

  if (groups.length === 0) {
    return (
      <div className="border border-line bg-surface p-10 text-center">
        <h2 className="text-base font-medium text-ink">Tidak ada yang menunggu keputusan</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          Semua transaksi sudah punya kategori yang kamu setujui, entah langsung atau lewat aturan.
        </p>
      </div>
    )
  }

  const covered = groups.slice(0, 10).reduce((sum, group) => sum + group.total, 0n)

  return (
    <div className="space-y-5">
      <div className="border border-line bg-sunken p-4">
        <p className="text-sm text-ink">
          <span className="tnum font-mono">{remaining.count}</span> transaksi menunggu, senilai{' '}
          <span className="tnum font-mono">{formatIdr(remaining.total)}</span>.
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Terkumpul jadi {groups.length} lawan transaksi. Sepuluh teratas saja sudah mencakup{' '}
          {formatIdrCompact(covered)}.
        </p>
      </div>

      <ul className="space-y-2">
        {groups.map((group) => (
          <li key={group.pattern}>
            <GroupCard
              group={group}
              categories={categories}
              open={open === group.pattern}
              onToggle={() => setOpen(open === group.pattern ? null : group.pattern)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function GroupCard({
  group,
  categories,
  open,
  onToggle,
}: {
  group: ReviewGroup
  categories: CategoryOption[]
  open: boolean
  onToggle: () => void
}) {
  const [result, action] = useActionState<ActionResult | null, FormData>(applyCategory, null)
  const [pattern, setPattern] = useState(group.pattern)
  const [matchType, setMatchType] = useState<MatchType>(group.matchType)

  const headingId = `grup-${group.pattern.replace(/\W+/g, '-')}`

  return (
    <div className="border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${headingId}-isi`}
        className="flex w-full items-baseline justify-between gap-4 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm text-ink">{group.pattern}</span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            {group.count} transaksi
            {group.currentCategories.length > 0
              ? ` · sekarang ${group.currentCategories.join(', ')}`
              : ''}
          </span>
        </span>
        <span className="tnum shrink-0 font-mono text-sm text-ink">
          {formatIdrCompact(group.total)}
        </span>
      </button>

      {open ? (
        <div id={`${headingId}-isi`} className="border-t border-line px-4 py-4">
          {result?.ok ? (
            <p className="mb-3 border border-under/40 bg-under-wash px-3 py-2 text-sm text-ink">
              {result.message}
              {result.detail ? (
                <span className="mt-0.5 block text-ink-muted">{result.detail}</span>
              ) : null}
            </p>
          ) : null}

          {result && !result.ok ? (
            <p className="mb-3 border border-over/40 bg-over-wash px-3 py-2 text-sm text-ink">
              {result.message}
              {result.detail ? (
                <span className="mt-0.5 block text-ink-muted">{result.detail}</span>
              ) : null}
            </p>
          ) : null}

          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Contoh keterangannya
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-ink-muted">
              {group.samples.map((sample) => (
                <li key={sample} className="truncate">
                  {sample}
                </li>
              ))}
            </ul>
          </div>

          <form action={action} className="space-y-3">
            <input type="hidden" name="pattern" value={pattern} />
            <input type="hidden" name="matchType" value={matchType} />

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
                  Kategori
                </span>
                <select
                  name="categoryId"
                  required
                  defaultValue=""
                  className="mt-1 h-11 w-full border border-line bg-paper px-2 text-sm text-ink"
                >
                  <option value="" disabled>
                    Pilih kategori
                  </option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end">
                <Submit count={group.count} />
              </div>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-ink-muted">
                Pola yang dipakai: {MATCH_LABELS[matchType]} &ldquo;{pattern}&rdquo;
              </summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="block">
                  <span className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
                    Pola
                  </span>
                  <input
                    type="text"
                    value={pattern}
                    onChange={(event) => setPattern(event.target.value)}
                    maxLength={120}
                    className="mt-1 h-11 w-full border border-line bg-paper px-2 text-sm text-ink"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
                    Cara mencocokkan
                  </span>
                  <select
                    value={matchType}
                    onChange={(event) => setMatchType(event.target.value as MatchType)}
                    className="mt-1 h-11 border border-line bg-paper px-2 text-sm text-ink"
                  >
                    {(Object.keys(MATCH_LABELS) as MatchType[]).map((type) => (
                      <option key={type} value={type}>
                        {MATCH_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                Dicocokkan ke keterangan asli dari bank, bukan ke keterangan yang sudah dirapikan.
              </p>
            </details>

            <label className="flex items-start gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                name="remember"
                defaultChecked
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                Simpan sebagai aturan, supaya impor berikutnya mengategorikan pola ini sendiri.
              </span>
            </label>
          </form>

          <SingleRows entries={group.entries} categories={categories} />
        </div>
      ) : null}
    </div>
  )
}

function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-sm bg-accent px-5 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent-strong disabled:opacity-50 sm:w-auto"
    >
      {pending ? 'Menyimpan' : `Terapkan ke ${count}`}
    </button>
  )
}

/**
 * The escape hatch for a row that does not belong with the rest of its group.
 * Collapsed by default: needing it is the exception, and showing eighty rows by
 * default would undo the point of grouping them.
 */
function SingleRows({
  entries,
  categories,
}: {
  entries: ReviewGroup['entries']
  categories: CategoryOption[]
}) {
  const [result, action] = useActionState<ActionResult | null, FormData>(categoriseOne, null)

  return (
    <details className="mt-4 border-t border-line pt-3 text-sm">
      <summary className="cursor-pointer text-ink-muted">
        Atur satu per satu ({entries.length} transaksi)
      </summary>

      {result ? (
        <p className={`mt-2 text-sm ${result.ok ? 'text-under' : 'text-over'}`}>{result.message}</p>
      ) : null}

      <ul className="mt-2 space-y-2">
        {entries.slice(0, 25).map((entry) => (
          <li key={entry.id}>
            <form action={action} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="transactionId" value={entry.id} />
              <span className="min-w-0 flex-1 truncate text-ink-muted">{entry.description}</span>
              <span className="tnum shrink-0 font-mono text-xs text-ink">
                {formatIdr(entry.amount)}
              </span>
              <select
                name="categoryId"
                required
                defaultValue=""
                aria-label={`Kategori untuk ${entry.description}`}
                className="h-11 border border-line bg-paper px-2 text-sm text-ink"
              >
                <option value="" disabled>
                  Pilih
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-11 border border-line-strong px-3 text-sm text-ink transition-colors duration-150 hover:bg-sunken"
              >
                Simpan
              </button>
            </form>
          </li>
        ))}
      </ul>

      {entries.length > 25 ? (
        <p className="mt-2 text-xs text-ink-faint">
          Menampilkan 25 dari {entries.length}. Sisanya muncul setelah yang ini diselesaikan.
        </p>
      ) : null}
    </details>
  )
}
