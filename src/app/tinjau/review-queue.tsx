'use client'

import { useActionState, useOptimistic, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AccountMark, CashflowChip, DirectionMark } from '@/components/marks'
import { SignedMoney } from '@/components/money'
import { formatJakarta, formatMonthKey } from '@/lib/datetime'
import {
  DIRECTION_LABELS,
  directionOf,
  signedDirection,
  type Direction,
} from '@/lib/ledger/direction'
import { monthKeyOf, monthKeyToString } from '@/lib/ledger/monthly'
import { MATCH_LABELS, type MatchType, type ReviewGroup } from '@/lib/ledger/rules'
import { optionGroups } from '@/lib/ledger/settings'
import type { CashflowType } from '@/lib/ledger/types'
import type { UnconfirmedRow } from '@/lib/queries/household'
import { CONTROL } from '@/components/field-base'
import { queueHref, type QueueOptions } from './query'
import { applyCategory, categoriseOne, type ActionResult } from './actions'
import { subtractSettled } from './optimistic'
import { topShareSentence, type QueueSummary } from './summary'
import { CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown'
import { ListChecks } from '@phosphor-icons/react/dist/ssr/ListChecks'
import { Unavailable } from '@/components/unavailable'

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
  /** The group it is listed under, or null when it is listed by cashflow. */
  parentId: string | null
  /** One sentence saying what belongs here, read out under the picker. */
  description?: string | null
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
  remaining: QueueSummary
  options: QueueOptions
}

export function ReviewQueue({ groups, categories, accounts, remaining, options }: Props) {
  const [open, setOpen] = useState<string | null>(groups[0]?.key ?? null)

  /*
    Keys of the groups whose "Terapkan ke N" is on its way to the server. The
    base is always the empty list, rebuilt from props on every render: when the
    revalidated list arrives without the group, the entry has nothing left to
    hide, and when the action fails, React discards it and the card simply
    comes back with the error the form already renders. No rollback to write.
  */
  const [settling, markSettling] = useOptimistic<string[], string>([], (keys, key) => [
    ...keys,
    key,
  ])
  const shown = subtractSettled(remaining, groups, settling)

  if (groups.length === 0) {
    return (
      <Unavailable glyph={ListChecks} heading title="Tidak ada yang menunggu keputusan">
        Semua transaksi sudah punya kategori yang kamu setujui, entah langsung atau lewat aturan.
      </Unavailable>
    )
  }

  // Only when the order is by size: sorted by time, the first ten are merely
  // the newest, and how much of the queue they hold says nothing.
  const topShare =
    options.kelompok === 'lawan' && options.urut === 'nominal' ? topShareSentence(groups, 10) : null
  const out = groups.filter((group) => group.direction === 'out').length
  const incoming = groups.length - out
  const byName = new Map(accounts.map((account) => [account.id, account]))

  const rangeLabel = shown.range
    ? shown.range.from === shown.range.to
      ? formatMonthKey(shown.range.from)
      : `${formatMonthKey(shown.range.from)} sampai ${formatMonthKey(shown.range.to)}`
    : null

  return (
    <div className="space-y-5">
      <div className="squircle rounded-md bg-sunken p-4">
        <p className="text-subhead text-ink">
          <span className="tnum font-mono">{shown.count}</span> transaksi menunggu
          {rangeLabel ? `, ${rangeLabel}` : ''}.
        </p>

        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          <div>
            <dt className="text-footnote text-ink-faint">Menunggu keluar</dt>
            <dd className="text-subhead text-ink">
              <SignedMoney sen={shown.out.total} direction="out" />
              <span className="ml-1 text-ink-faint">({shown.out.count})</span>
            </dd>
          </div>
          <div>
            <dt className="text-footnote text-ink-faint">Menunggu masuk</dt>
            <dd className="text-subhead text-ink">
              <SignedMoney sen={shown.in.total} direction="in" />
              <span className="ml-1 text-ink-faint">({shown.in.count})</span>
            </dd>
          </div>
        </dl>

        <p className="mt-2 text-subhead text-ink-muted">
          Terkumpul jadi {groups.length} kelompok: {out} keluar, {incoming} masuk.
          {topShare ? ` ${topShare}` : ''}
        </p>

        {shown.unseen > 0 ? (
          <p className="mt-1 text-subhead text-ink-muted">
            {shown.unseen} transaksi lain tidak punya lawan yang bisa dikelompokkan, dan hanya
            terlihat kalau dikelompokkan{' '}
            <a
              href={queueHref({ ...options, kelompok: 'bulan' })}
              className="text-accent underline underline-offset-2"
            >
              per bulan
            </a>
            .
          </p>
        ) : null}
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
              settling={settling.includes(group.key)}
              onSettle={markSettling}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The months a group spans, said once rather than per row. */
function spanOf(group: ReviewGroup<UnconfirmedRow>): string {
  const from = formatMonthKey(monthKeyToString(monthKeyOf(group.firstAt)))
  const to = formatMonthKey(monthKeyToString(monthKeyOf(group.lastAt)))
  return from === to ? from : `${from} sampai ${to}`
}

function GroupCard({
  group,
  index,
  categories,
  accounts,
  open,
  onToggle,
  settling,
  onSettle,
}: {
  group: ReviewGroup<UnconfirmedRow>
  index: number
  categories: CategoryOption[]
  accounts: Map<string, AccountOption>
  open: boolean
  onToggle: () => void
  settling: boolean
  onSettle: (key: string) => void
}) {
  const [result, action] = useActionState<ActionResult | null, FormData>(applyCategory, null)
  const [pattern, setPattern] = useState(group.pattern)
  const [matchType, setMatchType] = useState<MatchType>(group.matchType)

  /*
    Ids settled one at a time through the panel below, lifted up here rather
    than kept inside it: the count on "Terapkan ke N" and the sentence above
    the form both need to know how many are already spoken for before either
    is rendered. The server never needs this list — `applyCategory` reads
    `getUnconfirmed` fresh, so a row saved on its own has already left the
    set a pattern match can reach.
  */
  const [settledSingles, markSettledSingle] = useOptimistic<string[], string>(
    [],
    (ids, id) => [...ids, id],
  )

  const headingId = `grup-${index}`
  const allowed = categories.filter(
    (category) => directionOf(category.cashflow) === group.direction,
  )
  const label = group.kind === 'month' ? formatMonthKey(group.month ?? '') : group.pattern

  /*
    The optimistic mark rides inside the form action, which React runs in a
    transition; from an onClick the update would be dropped with a warning.
    On success the revalidated list arrives without this group and the slim
    card below is replaced by its absence. On failure the card comes back on
    its own, error and all.
  */
  const settleAction = (formData: FormData) => {
    onSettle(group.key)
    action(formData)
  }

  if (settling) {
    return (
      <div
        role="status"
        aria-busy="true"
        className="reveal squircle rounded-md bg-surface shadow-xs px-4 py-3"
      >
        <span className="text-subhead text-ink-muted">
          Menyimpan {group.count} transaksi dari {label}
        </span>
      </div>
    )
  }

  return (
    <div className="squircle rounded-md bg-surface shadow-xs">
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
            <span className="block truncate text-subhead text-ink">{label}</span>
          </span>
          <span className="mt-0.5 block text-footnote text-ink-muted">
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
          className="shrink-0 text-subhead"
        />
      </button>

      {open ? (
        <div id={`${headingId}-isi`} className="border-t border-line px-4 py-4">
          {result?.ok ? (
            <p className="mb-3 border border-under/40 bg-under-wash px-3 py-2 text-subhead text-ink">
              {result.message}
              {result.detail ? (
                <span className="mt-0.5 block text-ink-muted">{result.detail}</span>
              ) : null}
            </p>
          ) : null}

          {result && !result.ok ? (
            <p className="mb-3 border border-over/40 bg-over-wash px-3 py-2 text-subhead text-ink">
              {result.message}
              {result.detail ? (
                <span className="mt-0.5 block text-ink-muted">{result.detail}</span>
              ) : null}
            </p>
          ) : null}

          <div className="mb-4">
            <p className="text-footnote text-ink-faint">
              Contoh keterangannya
            </p>
            <ul className="mt-1 space-y-0.5 text-subhead text-ink-muted">
              {group.samples.map((sample) => (
                <li key={sample} className="truncate">
                  {sample}
                </li>
              ))}
            </ul>
          </div>

          {settledSingles.length > 0 ? (
            <p className="mb-3 text-subhead text-ink-muted">
              {group.kind === 'counterparty'
                ? `${settledSingles.length} sudah kamu atur sendiri, ${Math.max(0, group.count - settledSingles.length)} sisanya ikut pilihan di atas.`
                : `${settledSingles.length} sudah kamu atur sendiri.`}
            </p>
          ) : null}

          {group.kind === 'counterparty' ? (
            <form action={settleAction} className="space-y-3">
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
                  <Submit count={Math.max(0, group.count - settledSingles.length)} />
                </div>
              </div>

              <details className="text-subhead">
                <summary className="cursor-pointer text-ink-muted">
                  Pola yang dipakai: {MATCH_LABELS[matchType]} &ldquo;{pattern}&rdquo;
                </summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <label className="block">
                    <span className="block text-subhead font-medium text-ink">
                      Pola
                    </span>
                    <input
                      type="text"
                      value={pattern}
                      onChange={(event) => setPattern(event.target.value)}
                      maxLength={120}
                      className={`mt-1 ${CONTROL}`}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-subhead font-medium text-ink">
                      Cara mencocokkan
                    </span>
                    <select
                      value={matchType}
                      onChange={(event) => setMatchType(event.target.value as MatchType)}
                      className={`mt-1 ${CONTROL}`}
                    >
                      {(Object.keys(MATCH_LABELS) as MatchType[]).map((type) => (
                        <option key={type} value={type}>
                          {MATCH_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-2 text-footnote text-ink-muted">
                  Dicocokkan ke keterangan asli dari bank, bukan ke keterangan yang sudah dirapikan.
                </p>
              </details>

              <label className="flex items-start gap-2 text-subhead text-ink-muted">
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
            <p className="text-subhead text-ink-muted">
              Kelompok bulan tidak bisa disimpan sebagai aturan, karena sebuah bulan bukan pola yang
              bisa dicocokkan ke impor berikutnya. Atur barisnya satu per satu di bawah.
            </p>
          )}

          <SingleRows
            entries={group.entries}
            categories={allowed}
            accounts={accounts}
            settled={settledSingles}
            onSettleOne={markSettledSingle}
          />
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
  const grouped = optionGroups(categories)
  // The name is a label; the sentence under it is the household's tie-break
  // rule, read out for whichever category is currently chosen so the rule sits
  // beside the decision instead of in a settings page nobody has open.
  const [chosenId, setChosenId] = useState('')
  const chosen = categories.find((category) => category.id === chosenId)

  return (
    <label className="block">
      <span
        className={
          compactLabel
            ? 'sr-only'
            : 'block text-subhead font-medium text-ink'
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
        onChange={(event) => setChosenId(event.target.value)}
        className={`mt-1 ${CONTROL} disabled:opacity-60`}
      >
        <option value="" disabled>
          {empty ? `Tidak ada kategori untuk uang ${DIRECTION_LABELS[direction]}` : 'Pilih kategori'}
        </option>
        {grouped.map(({ label, options }) => (
          <optgroup key={label} label={label}>
            {options.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {chosen?.description ? (
        <span data-kamus className="mt-1 block text-footnote text-ink-muted">
          {chosen.description}
        </span>
      ) : null}
      {empty ? (
        <span className="mt-1 block text-footnote text-ink-muted">
          Buat kategorinya di{' '}
          <a href="/pengaturan#kategori" className="text-accent underline underline-offset-2">
            Pengaturan
          </a>
          , dengan cashflow yang arahnya sama.
        </span>
      ) : null}
    </label>
  )
}

function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-sm bg-accent px-5 text-subhead font-medium text-paper transition-colors duration-150 hover:bg-accent-strong disabled:opacity-50 sm:w-auto"
    >
      {pending ? 'Menyimpan' : `Terapkan ke ${count}`}
    </button>
  )
}

/**
 * The escape hatch for a row that does not belong with the rest of its group.
 *
 * Open by default for a small group, where checking each row costs nothing;
 * closed for a large one, where needing it is the exception. Either way every
 * row is here: a count that promises more than the list shows is the bug this
 * replaced, and a scrollable list is a smaller cost than a silent gap.
 */
function SingleRows({
  entries,
  categories,
  accounts,
  settled,
  onSettleOne,
}: {
  entries: UnconfirmedRow[]
  categories: CategoryOption[]
  accounts: Map<string, AccountOption>
  /** Ids saved one at a time so far, lifted to the group card above. */
  settled: readonly string[]
  onSettleOne: (id: string) => void
}) {
  const [result, action] = useActionState<ActionResult | null, FormData>(categoriseOne, null)

  return (
    <details
      className="group mt-4 border-t border-line pt-3 text-subhead"
      open={categories.length === 0 || entries.length <= 8}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-ink [&::-webkit-details-marker]:hidden">
        <span>Pilih pos per transaksi ({entries.length})</span>
        <CaretDown
          aria-hidden="true"
          weight="bold"
          className="size-4 shrink-0 text-ink-faint transition-transform duration-150 group-open:rotate-180"
        />
      </summary>

      {result ? (
        <p className={`mt-2 text-subhead ${result.ok ? 'text-under' : 'text-over'}`}>
          {result.message}
          {result.detail ? <span className="mt-0.5 block text-ink-muted">{result.detail}</span> : null}
        </p>
      ) : null}

      <ul className="mt-2 space-y-2">
        {entries.map((entry) => {
          const account = accounts.get(entry.fromAccountId ?? entry.toAccountId ?? '')
          if (settled.includes(entry.id)) {
            return (
              <li key={entry.id} className="border-b border-line pb-2 last:border-0">
                <p role="status" aria-busy="true" className="reveal truncate py-2 text-ink-muted">
                  Menyimpan {entry.description}
                </p>
              </li>
            )
          }
          const settleOne = (formData: FormData) => {
            onSettleOne(entry.id)
            action(formData)
          }
          return (
            <li key={entry.id} className="border-b border-line pb-2 last:border-0">
              <form action={settleOne} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <input type="hidden" name="transactionId" value={entry.id} />

                <div className="min-w-0">
                  <p className="flex items-baseline gap-1.5 text-ink">
                    <DirectionMark
                      direction={directionOf(entry.cashflow)}
                      className="translate-y-0.5"
                    />
                    <span className="min-w-0 truncate">{entry.description}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-ink-muted">
                    <span className="tnum">{formatJakarta(entry.occurredAt, 'datetime')}</span>
                    {account ? (
                      <AccountMark
                        name={account.name}
                        kind={account.kind}
                        className="text-footnote text-ink"
                      />
                    ) : (
                      <span>Akun tidak dikenal</span>
                    )}
                    <CashflowChip cashflow={entry.cashflow} />
                  </p>
                </div>

                <SignedMoney
                  sen={entry.amount}
                  direction={signedDirection(entry.cashflow)}
                  className="self-center text-subhead"
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
                    className="h-11 shrink-0 border border-line-strong px-3 text-subhead text-ink transition-colors duration-150 hover:bg-sunken"
                  >
                    Simpan
                  </button>
                </div>
              </form>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
