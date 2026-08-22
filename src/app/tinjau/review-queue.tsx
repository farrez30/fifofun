'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AccountMark, CashflowChip, DirectionMark } from '@/components/marks'
import { SignedMoney } from '@/components/money'
import { formatJakarta, formatMonthKey } from '@/lib/datetime'
import { formatIdr, formatIdrCompact } from '@/lib/money'
import {
  DIRECTION_LABELS,
  directionOf,
  signedDirection,
  type Direction,
} from '@/lib/ledger/direction'
import { MATCH_LABELS, type MatchType, type ReviewGroup } from '@/lib/ledger/rules'
import { CASHFLOW_LABELS, type CashflowType } from '@/lib/ledger/types'
import type { UnconfirmedRow } from '@/lib/queries/household'
import type { QueueOptions } from './query'
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
 *
 * Every row now says which way the money went, when, from or to which account,
 * and what it is currently filed as. Without those four, deciding a category
 * meant remembering a transaction from its bank description alone, which is
 * exactly the thing the description is worst at.
 */

export interface CategoryOption {
  id: string
  name: string
  cashflow: CashflowType
}

export interface AccountOption {
  id: string
  name: string
  kind: 'bank' | 'ewallet' | 'cash' | 'emoney' | 'investment'
}

interface Props {
  groups: ReviewGroup<UnconfirmedRow>[]
  categories: CategoryOption[]
  accounts: AccountOption[]
  /** Everything still waiting, so progress is a fraction rather than a feeling. */
  remaining: { count: number; total: bigint }
  options: QueueOptions
}

export function ReviewQueue({ groups, categories, accounts, remaining, options }: Props) {
  const [open, setOpen] = useState<string | null>(groups[0]?.key ?? null)

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
  const out = groups.filter((group) => group.direction === 'out').length
  const incoming = groups.length - out
  const byName = new Map(accounts.map((account) => [account.id, account]))

  return (
    <div className="space-y-5">
      <div className="border border-line bg-sunken p-4">
        <p className="text-sm text-ink">
          <span className="tnum font-mono">{remaining.count}</span> transaksi menunggu, senilai{' '}
          <span className="tnum font-mono">{formatIdr(remaining.total)}</span>.
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Terkumpul jadi {groups.length} kelompok: {out} keluar, {incoming} masuk.
          {options.kelompok === 'lawan'
            ? ` Sepuluh teratas saja sudah mencakup ${formatIdrCompact(covered)}.`
            : ''}
        </p>
      </div>

      <ul className="space-y-2">
        {groups.map((group, index) => (
          <li key={group.key}>
            <GroupCard
              group={group}
              index={index}
              categories={categories}
              accounts={byName}
              open={open === group.key}
              onToggle={() => setOpen(open === group.key ? null : group.key)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The months a group spans, said once rather than per row. */
function spanOf(group: ReviewGroup<UnconfirmedRow>): string {
  const from = formatMonthKey(monthOf(group.firstAt))
  const to = formatMonthKey(monthOf(group.lastAt))
  return from === to ? from : `${from} sampai ${to}`
}

function monthOf(date: Date): string {
  // Jakarta is a fixed offset, so this is the same month the grouper used.
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

function GroupCard({
  group,
  index,
  categories,
  accounts,
  open,
  onToggle,
}: {
  group: ReviewGroup<UnconfirmedRow>
  index: number
  categories: CategoryOption[]
  accounts: Map<string, AccountOption>
  open: boolean
  onToggle: () => void
}) {
  const [result, action] = useActionState<ActionResult | null, FormData>(applyCategory, null)
  const [pattern, setPattern] = useState(group.pattern)
  const [matchType, setMatchType] = useState<MatchType>(group.matchType)

  const headingId = `grup-${index}`
  const allowed = categories.filter(
    (category) => directionOf(category.cashflow) === group.direction,
  )
  const label = group.kind === 'month' ? formatMonthKey(group.month ?? '') : group.pattern

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
          <span className="flex items-baseline gap-1.5">
            <DirectionMark direction={group.direction} className="translate-y-0.5" />
            <span className="block truncate text-sm text-ink">{label}</span>
          </span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            {group.count} transaksi · {spanOf(group)}
            {group.currentCategories.length > 0
              ? ` · sekarang ${group.currentCategories.join(', ')}`
              : ''}
          </span>
        </span>
        <SignedMoney
          sen={group.total}
          direction={group.direction === 'in' ? 'in' : group.direction === 'out' ? 'out' : 'neutral'}
          compact
          className="shrink-0 text-sm"
        />
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

          {group.kind === 'counterparty' ? (
            <form action={action} className="space-y-3">
              <input type="hidden" name="pattern" value={pattern} />
              <input type="hidden" name="matchType" value={matchType} />

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <CategorySelect
                  name="categoryId"
                  label="Kategori"
                  direction={group.direction}
                  categories={allowed}
                />

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
          ) : (
            <p className="text-sm text-ink-muted">
              Kelompok bulan tidak bisa disimpan sebagai aturan, karena sebuah bulan bukan pola yang
              bisa dicocokkan ke impor berikutnya. Atur barisnya satu per satu di bawah.
            </p>
          )}

          <SingleRows entries={group.entries} categories={allowed} accounts={accounts} />
        </div>
      ) : null}
    </div>
  )
}

function CategorySelect({
  name,
  label,
  direction,
  categories,
  compactLabel = false,
}: {
  name: string
  label: string
  direction: Direction
  categories: CategoryOption[]
  compactLabel?: boolean
}) {
  const empty = categories.length === 0
  const byCashflow = new Map<CashflowType, CategoryOption[]>()
  for (const category of categories) {
    byCashflow.set(category.cashflow, [...(byCashflow.get(category.cashflow) ?? []), category])
  }

  return (
    <label className="block">
      <span
        className={
          compactLabel
            ? 'sr-only'
            : 'block text-xs font-medium uppercase tracking-wide text-ink-faint'
        }
      >
        {label}
      </span>
      <select
        name={name}
        required
        disabled={empty}
        defaultValue=""
        aria-label={compactLabel ? label : undefined}
        className="mt-1 h-11 w-full border border-line bg-paper px-2 text-sm text-ink disabled:opacity-60"
      >
        <option value="" disabled>
          {empty ? `Tidak ada kategori untuk uang ${DIRECTION_LABELS[direction]}` : 'Pilih kategori'}
        </option>
        {[...byCashflow.entries()].map(([cashflow, options]) => (
          <optgroup key={cashflow} label={CASHFLOW_LABELS[cashflow]}>
            {options.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
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
  accounts,
}: {
  entries: UnconfirmedRow[]
  categories: CategoryOption[]
  accounts: Map<string, AccountOption>
}) {
  const [result, action] = useActionState<ActionResult | null, FormData>(categoriseOne, null)

  return (
    <details className="mt-4 border-t border-line pt-3 text-sm" open={categories.length === 0}>
      <summary className="cursor-pointer text-ink-muted">
        Atur satu per satu ({entries.length} transaksi)
      </summary>

      {result ? (
        <p className={`mt-2 text-sm ${result.ok ? 'text-under' : 'text-over'}`}>
          {result.message}
          {result.detail ? <span className="mt-0.5 block text-ink-muted">{result.detail}</span> : null}
        </p>
      ) : null}

      <ul className="mt-2 space-y-2">
        {entries.slice(0, 25).map((entry) => {
          const account = accounts.get(entry.fromAccountId ?? entry.toAccountId ?? '')
          return (
            <li key={entry.id} className="border-b border-line pb-2 last:border-0">
              <form action={action} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <input type="hidden" name="transactionId" value={entry.id} />

                <div className="min-w-0">
                  <p className="flex items-baseline gap-1.5 text-ink">
                    <DirectionMark
                      direction={directionOf(entry.cashflow)}
                      className="translate-y-0.5"
                    />
                    <span className="min-w-0 truncate">{entry.description}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                    <span className="tnum">{formatJakarta(entry.occurredAt, 'datetime')}</span>
                    {account ? (
                      <AccountMark name={account.name} kind={account.kind} className="text-xs" />
                    ) : (
                      <span>Akun tidak dikenal</span>
                    )}
                    <CashflowChip cashflow={entry.cashflow} />
                  </p>
                </div>

                <SignedMoney
                  sen={entry.amount}
                  direction={signedDirection(entry.cashflow)}
                  className="self-center text-sm"
                />

                <div className="flex items-end gap-2">
                  <CategorySelect
                    name="categoryId"
                    label={`Kategori untuk ${entry.description}`}
                    direction={directionOf(entry.cashflow)}
                    categories={categories}
                    compactLabel
                  />
                  <button
                    type="submit"
                    className="h-11 shrink-0 border border-line-strong px-3 text-sm text-ink transition-colors duration-150 hover:bg-sunken"
                  >
                    Simpan
                  </button>
                </div>
              </form>
            </li>
          )
        })}
      </ul>

      {entries.length > 25 ? (
        <p className="mt-2 text-xs text-ink-faint">
          Menampilkan 25 dari {entries.length}. Sisanya muncul setelah yang ini diselesaikan.
        </p>
      ) : null}
    </details>
  )
}
