'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CategoryMark } from '@/components/marks'
import { directionOf, type Direction } from '@/lib/ledger/direction'
import { optionGroups, type OptionGroup } from '@/lib/ledger/settings'
import { HOLD } from '@/lib/ledger/tidy'
import type { CashflowType } from '@/lib/ledger/types'
import { tidyLedger, type ActionResult } from './actions'
import type { CategoryOption } from './review-queue'

/**
 * Putting old rows where today's rules say they belong.
 *
 * The queue below settles rows nobody has looked at. This settles rows that
 * were looked at by an importer whose guesses were wrong: every QRIS payment
 * became a meal, so a year of petrol sat under Makan/minum with a confirmation
 * stamp on it, out of reach of every rule written since.
 *
 * The figures are computed on the server by the same function the button runs,
 * so what is listed is what happens. Every move opens into the transactions
 * that make it, each naming the rule that claimed it, because a line reading
 * "Makan/minum to Internet & TV, 2, Rp15.000" cannot be judged right or wrong
 * from the outside. There is no undo, so the evidence comes first.
 *
 * Laid out the way the review queue lays out its groups rather than as a table:
 * a row that opens into a form is not a table row, and columns that only the
 * heading and the footer size would sit under figures that do not line up
 * with them.
 */

export interface TidyEntryView {
  id: string
  /** Already formatted; a Date would cross the boundary as a string anyway. */
  occurredAt: string
  description: string
  amount: string
  cashflow: CashflowType
  pattern: string
}

export interface TidyMoveView {
  key: string
  from: string
  to: string
  toCategoryId: string
  cashflow: CashflowType
  icon: string | null
  hue: number | null
  count: number
  amount: string
  entries: TidyEntryView[]
}

export interface TidyView {
  moves: TidyMoveView[]
  count: number
  amount: string
  protectedCount: number
  heldCount: number
}

/** What a row will do when the button is pressed, once somebody has said. */
type Choices = Record<string, string>

/**
 * The pots on offer, arranged once for each way money can move.
 *
 * Every row in a move faces the same way, but the grouping is worked out per
 * direction rather than per move so nothing here depends on that holding: an
 * income row appearing in a spending move would still be offered income pots.
 */
type OptionsByDirection = Record<Direction, OptionGroup<CategoryOption>[]>

function Submit({ label, disabled = false }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="h-11 rounded-sm bg-accent px-4 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent-strong disabled:opacity-50"
    >
      {pending ? 'Merapikan' : label}
    </button>
  )
}

function Reply({ result }: { result: ActionResult }) {
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

export function TidyPanel({ view, categories }: { view: TidyView; categories: CategoryOption[] }) {
  const [result, run] = useActionState<ActionResult | null, FormData>(tidyLedger, null)
  const [agreed, setAgreed] = useState(false)
  // The largest move starts open, the way the review queue opens its first
  // group: a panel that opens to nothing asks somebody to guess where to click.
  const [open, setOpen] = useState<string | null>(view.moves[0]?.key ?? null)
  const [choices, setChoices] = useState<Choices>({})

  // Some sixty pots, grouped once rather than once per transaction on screen.
  const options = useMemo<OptionsByDirection>(() => {
    const of = (direction: Direction) =>
      optionGroups(categories.filter((category) => directionOf(category.cashflow) === direction))
    return { in: of('in'), out: of('out'), neither: of('neither') }
  }, [categories])

  if (view.count === 0 && !result) return null

  const live = new Set(view.moves.flatMap((move) => move.entries.map((entry) => entry.id)))
  const held = Object.entries(choices).filter(
    ([id, choice]) => choice === HOLD && live.has(id),
  ).length
  const redirected = view.moves.reduce(
    (total, move) =>
      total +
      move.entries.filter((entry) => {
        const choice = choices[entry.id]
        return choice !== undefined && choice !== HOLD && choice !== move.toCategoryId
      }).length,
    0,
  )

  return (
    <section
      id="rapikan"
      aria-labelledby="rapikan-judul"
      className="border border-line bg-sunken/40 p-4"
    >
      <h2 id="rapikan-judul" className="text-sm font-medium text-ink">
        {view.count} transaksi lama senilai {view.amount} ada di pos yang bukan tempatnya
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Impor lama menebak kategori dari cara uangnya bergerak, bukan dari siapa yang dibayar, jadi
        setiap pembayaran QRIS jadi Makan/minum dan setiap tagihan jadi Belanja. Aturan yang
        sekarang tahu bedanya. Buka satu pindahan untuk memeriksa transaksinya sebelum menyetujui.
      </p>

      {view.moves.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {view.moves.map((move) => (
            <li key={move.key}>
              <Move
                move={move}
                options={options}
                choices={choices}
                onChoose={(id, choice) => setChoices({ ...choices, [id]: choice })}
                open={open === move.key}
                onToggle={() => setOpen(open === move.key ? null : move.key)}
                run={run}
                result={result?.scope === move.key ? result : null}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {held > 0 || redirected > 0 ? (
        <p className="mt-3 text-sm text-ink">
          {view.count - held} akan dipindahkan
          {held > 0 ? `, ${held} ditahan` : ''}
          {redirected > 0 ? `, ${redirected} dibelokkan ke pos lain` : ''}.
        </p>
      ) : null}

      <p className="mt-3 text-sm text-ink-muted">
        Hanya transaksi yang masih duduk di pos bawaan impor yang dipindahkan.
        {view.protectedCount > 0
          ? ` ${view.protectedCount} transaksi yang kategorinya pernah kamu tetapkan sendiri tidak disentuh.`
          : ''}
        {view.heldCount > 0
          ? ` ${view.heldCount} transaksi yang pernah kamu tahan juga tidak ditawarkan lagi.`
          : ''}
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Perpindahan ini tidak bisa dibatalkan sekaligus. Yang salah bisa kamu ubah satu per satu
        dari halaman transaksinya.
      </p>

      <form action={run} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="scope" value="semua" />
        {/* Running one move leaves its rows behind in state while the server
            sends back a plan without them. Sending those ids would earn a
            refusal for rows that are already exactly where they were asked to
            be, so the stale ones are dropped rather than argued about. */}
        {Object.entries(choices)
          .filter(([id]) => live.has(id))
          .map(([id, choice]) => (
            <input key={id} type="hidden" name={`pilih:${id}`} value={choice} />
          ))}
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="confirm"
            value="ya"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            className="size-5 accent-[var(--accent)]"
          />
          Saya sudah membaca daftarnya
        </label>
        <Submit label="Rapikan semua" disabled={!agreed || view.count === 0} />
      </form>

      {/* A reply to one move is shown under that move; everything else lands here. */}
      {result && (!result.scope || result.scope === 'semua') ? <Reply result={result} /> : null}
    </section>
  )
}

/**
 * One pot's worth of moves, and on request the transactions inside it.
 *
 * The rows are rendered only while the move is open. That is not tidiness: a
 * category select carries some sixty options, and three hundred and seventy
 * eight of those at once is twenty thousand nodes nobody asked for. What a
 * person already decided lives in the panel's state instead, so closing a move
 * does not throw their decisions away with the markup.
 */
function Move({
  move,
  options,
  choices,
  onChoose,
  open,
  onToggle,
  run,
  result,
}: {
  move: TidyMoveView
  options: OptionsByDirection
  choices: Choices
  onChoose: (id: string, choice: string) => void
  open: boolean
  onToggle: () => void
  run: (formData: FormData) => void
  result: ActionResult | null
}) {
  const bodyId = `pindahan-${move.key}`
  const moving = move.entries.filter((entry) => choices[entry.id] !== HOLD).length

  return (
    <div className="border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex min-h-11 w-full items-baseline justify-between gap-4 px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <CategoryMark
            name={move.to}
            cashflow={move.cashflow}
            icon={move.icon}
            hue={move.hue}
          />
          <span className="mt-0.5 block text-xs text-ink-muted">
            {move.count} transaksi · sekarang di {move.from} ·{' '}
            {/* Said in words rather than drawn as a caret, the way the report's
                disclosures say what opening one gives you. */}
            {open ? 'tutup' : 'lihat transaksinya'}
          </span>
        </span>
        <span className="shrink-0 tabular-nums text-sm text-ink">{move.amount}</span>
      </button>

      {open ? (
        <div id={bodyId} className="border-t border-line px-3 py-3">
          <ul className="space-y-2">
            {move.entries.map((entry) => (
              <li key={entry.id} className="border-b border-line/60 pb-2 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 text-sm text-ink">{entry.description}</span>
                  <span className="tabular-nums text-sm text-ink">{entry.amount}</span>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  <span className="tabular-nums">{entry.occurredAt}</span> · cocok dengan aturan
                  &ldquo;{entry.pattern}&rdquo; ·{' '}
                  <a
                    href={`/transaksi/${entry.id}`}
                    className="text-accent underline underline-offset-2"
                  >
                    buka transaksinya
                  </a>
                </p>
                <EntryChoice
                  entry={entry}
                  move={move}
                  options={options}
                  value={choices[entry.id] ?? move.toCategoryId}
                  onChoose={onChoose}
                />
              </li>
            ))}
          </ul>

          <form action={run} className="mt-3">
            <input type="hidden" name="scope" value={move.key} />
            {move.entries.map((entry) =>
              choices[entry.id] === undefined ? null : (
                <input
                  key={entry.id}
                  type="hidden"
                  name={`pilih:${entry.id}`}
                  value={choices[entry.id]}
                />
              ),
            )}
            <Submit
              label={
                moving > 0
                  ? `Pindahkan ${moving} transaksi ke ${move.to}`
                  : `Tahan ${move.entries.length} transaksi ini`
              }
            />
          </form>

          {result ? <Reply result={result} /> : null}
        </div>
      ) : null}
    </div>
  )
}

/** Where this one row goes, which unless somebody says otherwise is where the rule said. */
function EntryChoice({
  entry,
  move,
  options,
  value,
  onChoose,
}: {
  entry: TidyEntryView
  move: TidyMoveView
  options: OptionsByDirection
  value: string
  onChoose: (id: string, choice: string) => void
}) {
  const allowed = options[directionOf(entry.cashflow)]

  return (
    <select
      value={value}
      onChange={(event) => onChoose(entry.id, event.target.value)}
      aria-label={`Pos untuk ${entry.description}`}
      className="mt-1.5 h-11 w-full max-w-sm border border-line bg-paper px-2 text-sm text-ink"
    >
      <option value={HOLD}>Jangan pindahkan, biarkan di {move.from}</option>
      {allowed.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
