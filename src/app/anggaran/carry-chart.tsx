'use client'

import { useActionState, useId, useRef, useState, type KeyboardEvent } from 'react'
import { BUTTON_PLAIN, BUTTON_PRIMARY, CONTROL, SEGMENT, SEGMENT_ON, SEGMENTED } from '@/components/field-base'
import { InfoTip } from '@/components/info-tip'
import { CHIP_RADIO } from '@/app/catat/account-chips'
import { MoneyInput } from '@/components/money-input'
import { useActionToast } from '@/components/use-action-toast'
import type { ActionResult } from '@/lib/actions'
import { ID_MONTH_LABELS } from '@/lib/datetime'
import { formatIdr } from '@/lib/money'
import {
  CARRY_POLICIES,
  fromWire,
  runCarry,
  type CarryPeriod,
  type CarryPeriodWire,
  type CarryPolicy,
  type CarryRun,
  type CarrySeries,
} from '@/lib/ledger/carry'
import { saveWeeklyBudget } from './actions'

/**
 * One category, period by period: what it was allowed, what it got after the
 * leftover of the period before, and what it spent.
 *
 * The question is the one a monthly total cannot answer: "if I had let the
 * rest of last week roll over, would this week have held?" So the three ways
 * of treating a leftover are computed side by side from the same figures,
 * and the toggle only chooses which one the chart draws. Nothing about the
 * leftover is stored; only the weekly budget itself is (ADR 0009).
 *
 * Marks, front to back: the spending bar, the effective budget (solid), the
 * base budget (dashed), and between the two a band in the under colour when
 * a leftover was added and the over colour when an overrun was taken off. A
 * bar past the solid line is over, and says so three ways: the over colour,
 * its length, and the words in the readout and the table.
 *
 * Interaction is the year strip's: hover previews a period in the readout,
 * click or arrow keys pin it, and only the pinned column is `aria-checked`.
 * All three choices live in the address with `replaceState`, so a reload or
 * a shared link opens the same view without a server round trip per toggle.
 */

export type CarryPer = 'bulan' | 'minggu'

export interface CarryChartProps {
  categories: { id: string; name: string }[]
  series: CarrySeries[]
  initialCategory: string
  initialPer: CarryPer
  initialPolicy: CarryPolicy
}

const POLICY_LABEL: Record<CarryPolicy, string> = {
  bawa: 'Bawa',
  tabung: 'Tabung',
  biarkan: 'Biarkan',
}

const POLICY_LONG: Record<CarryPolicy, string> = {
  bawa: 'Bawa ke periode berikutnya',
  tabung: 'Tabung sisanya',
  biarkan: 'Biarkan hangus',
}

const PER_LABEL: Record<CarryPer, string> = { bulan: 'Bulan', minggu: 'Minggu' }
const PERIOD_WORD: Record<CarryPer, string> = { bulan: 'bulan', minggu: 'minggu' }

function pctOf(value: bigint, ceiling: bigint): number {
  if (ceiling <= 0n || value <= 0n) return 0
  const clamped = value > ceiling ? ceiling : value
  return Number((clamped * 10_000n) / ceiling) / 100
}

function money(sen: bigint): string {
  return sen < 0n ? `minus ${formatIdr(-sen)}` : formatIdr(sen)
}

function remember(key: string, value: string) {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set(key, value)
    window.history.replaceState(window.history.state, '', url)
  } catch {
    // A sandboxed preview without history is still a working chart.
  }
}

export function CarryChart({
  categories,
  series,
  initialCategory,
  initialPer,
  initialPolicy,
}: CarryChartProps) {
  const [categoryId, setCategoryId] = useState(initialCategory)
  const [per, setPer] = useState<CarryPer>(initialPer)
  const [policy, setPolicy] = useState<CarryPolicy>(initialPolicy)
  const selectId = useId()

  const one = series.find((s) => s.categoryId === categoryId) ?? series[0]
  const name = categories.find((c) => c.id === one?.categoryId)?.name ?? ''
  const wire: CarryPeriodWire[] = (per === 'bulan' ? one?.monthly : one?.weekly) ?? []

  // All three runs, always: the table compares them, and one ceiling over all
  // three keeps the bars from rescaling when the toggle changes.
  // Twelve periods, three runs: cheap enough to redo every render.
  const input = fromWire(wire)
  const runs = Object.fromEntries(CARRY_POLICIES.map((p) => [p, runCarry(input, p)])) as Record<
    CarryPolicy,
    CarryRun
  >
  const run = runs[policy]

  let ceiling = 0n
  for (const each of Object.values(runs)) {
    for (const period of each.periods) {
      for (const value of [period.used, period.base ?? 0n, period.effective ?? 0n]) {
        if (value > ceiling) ceiling = value
      }
    }
  }

  return (
    <figure className="squircle rounded-md border border-line bg-surface p-4">
      <figcaption className="flex items-center gap-1 text-sm font-medium text-ink">
        Sisa anggaran per kategori
        <InfoTip label="Cara membaca">
          Batang adalah yang terpakai. Garis putus-putus anggaran dasarnya, garis tegas anggaran
          setelah ditambah atau dikurangi sisa periode sebelumnya. Pita hijau berarti ada sisa yang
          dibawa, pita merah berarti minus periode lalu memotong anggaran. Hitungan bawaan mulai dari
          kolom pertama yang punya anggaran, dan periode yang masih berjalan belum ditutup.
        </InfoTip>
      </figcaption>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <label htmlFor={selectId} className="text-xs text-ink-muted">
            Kategori
          </label>
          <select
            id={selectId}
            value={one?.categoryId ?? ''}
            onChange={(event) => {
              setCategoryId(event.target.value)
              remember('kategori', event.target.value)
            }}
            className={`${CONTROL} mt-1`}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <Segmented
          label="Periode"
          options={(['bulan', 'minggu'] as CarryPer[]).map((p) => ({ id: p, label: PER_LABEL[p] }))}
          value={per}
          onChange={(p) => {
            setPer(p)
            remember('per', p)
          }}
        />
        <Segmented
          label="Sisa periode"
          options={CARRY_POLICIES.map((p) => ({ id: p, label: POLICY_LABEL[p], hint: POLICY_LONG[p] }))}
          value={policy}
          onChange={(p) => {
            setPolicy(p)
            remember('sisa', p)
          }}
        />
      </div>

      {run.budgeted === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          {per === 'minggu'
            ? `${name} belum punya anggaran mingguan. Isi angkanya di bawah, nanti grafiknya terisi.`
            : `${name} tidak dianggarkan di dua belas bulan ini. Isi anggarannya di tabel di atas.`}
        </p>
      ) : (
        <Plot key={`${one?.categoryId}-${per}`} run={run} wire={wire} ceiling={ceiling} per={per} />
      )}

      <Legend />

      <Comparison runs={runs} policy={policy} per={per} />

      {per === 'minggu' && one ? (
        <WeeklyForm
          key={one.categoryId}
          categoryId={one.categoryId}
          name={name}
          weeks={one.weekly}
          rows={one.weeklyRows}
        />
      ) : null}
    </figure>
  )
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: T; label: string; hint?: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className={`${SEGMENTED} mt-1`}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            aria-label={option.hint}
            title={option.hint}
            onClick={() => onChange(option.id)}
            className={`${SEGMENT} ${value === option.id ? SEGMENT_ON : ''}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const STATUS_TEXT: Record<CarryPeriod['status'], string> = {
  aman: 'aman',
  'pakai-bawaan': 'memakai sisa yang dibawa',
  lewat: 'lewat anggaran',
  'tanpa-anggaran': 'tidak dianggarkan',
}

function describe(period: CarryPeriod, label: string): string {
  const used = `terpakai ${money(period.used)}`
  if (period.effective === null) return `${label}: ${used}, tidak dianggarkan`
  return `${label}: ${used}, anggaran ${money(period.effective)}, ${STATUS_TEXT[period.status]}${
    period.open ? ', masih berjalan' : ''
  }`
}

function Plot({
  run,
  wire,
  ceiling,
  per,
}: {
  run: CarryRun
  wire: CarryPeriodWire[]
  ceiling: bigint
  per: CarryPer
}) {
  // The running period, or the newest closed one when nothing is running.
  const fallback =
    run.periods.find((p) => p.open)?.key ?? run.periods[run.periods.length - 1]?.key ?? null
  const [pinned, setPinned] = useState<string | null>(fallback)
  const [hovered, setHovered] = useState<string | null>(null)
  const columns = useRef(new Map<string, HTMLDivElement>())

  const labelOf = (key: string) => wire.find((w) => w.key === key)?.label ?? key
  const active = run.periods.find((p) => p.key === (hovered ?? pinned)) ?? null

  function choose(key: string) {
    setPinned(key)
    columns.current.get(key)?.focus()
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>, key: string) {
    const index = run.periods.findIndex((p) => p.key === key)
    let next: number | null = null
    if (event.key === 'ArrowRight') next = Math.min(run.periods.length - 1, index + 1)
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1)
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = run.periods.length - 1
    if (next === null) return
    event.preventDefault()
    choose(run.periods[next].key)
  }

  // Under weekly columns, the Monday's month, only where it turns.
  const monthOf = (key: string) => ID_MONTH_LABELS[Number(key.slice(5, 7)) - 1]
  const monthTurns = wire.map((w, i) =>
    per === 'minggu' && (i === 0 || monthOf(w.key) !== monthOf(wire[i - 1].key))
      ? monthOf(w.key)
      : null,
  )

  return (
    <>
      <Readout period={active} label={active ? labelOf(active.key) : ''} />

      <div
        role="radiogroup"
        aria-label={`Terpakai per ${PERIOD_WORD[per]} terhadap anggarannya`}
        className="mt-3 grid"
        style={{ gridTemplateColumns: `repeat(${run.periods.length}, minmax(0, 1fr))` }}
        onPointerLeave={() => setHovered(null)}
      >
        {run.periods.map((period) => {
          const chosen = period.key === pinned
          const base = period.base === null ? null : pctOf(period.base, ceiling)
          const effective = period.effective === null ? null : pctOf(period.effective, ceiling)
          const usedPct = pctOf(period.used, ceiling)
          const band =
            base !== null && effective !== null && period.carryIn !== 0n
              ? { bottom: Math.min(base, effective), height: Math.abs(effective - base) }
              : null
          return (
            <div
              key={period.key}
              ref={(node) => {
                if (node) columns.current.set(period.key, node)
                else columns.current.delete(period.key)
              }}
              role="radio"
              aria-checked={chosen}
              tabIndex={chosen ? 0 : -1}
              aria-label={describe(period, labelOf(period.key))}
              data-carry-period={period.key}
              data-carry-status={period.status}
              onPointerEnter={() => setHovered(period.key)}
              onClick={() => choose(period.key)}
              onKeyDown={(event) => onKey(event, period.key)}
              className="relative h-40 cursor-pointer"
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-px right-px block ${
                  chosen ? 'bg-fill-quaternary outline outline-1 outline-line-strong' : ''
                } ${period.open ? 'bg-fill-quaternary' : ''}`}
              >
                {band ? (
                  <span
                    data-carry-band={period.carryIn > 0n ? 'tambah' : 'potong'}
                    className={`absolute inset-x-0 block ${
                      period.carryIn > 0n ? 'bg-under/35' : 'bg-over/30'
                    }`}
                    style={{ bottom: `${band.bottom}%`, height: `${band.height}%` }}
                  />
                ) : null}
                {period.used > 0n ? (
                  <span
                    data-carry-used={period.key}
                    className={`bar-rise absolute inset-x-[22%] bottom-0 block rounded-t-[2px] ${
                      period.status === 'lewat' ? 'bg-over' : 'bg-accent'
                    }`}
                    style={{ height: `max(2px, ${usedPct}%)` }}
                  />
                ) : null}
                {base !== null && period.carryIn !== 0n ? (
                  <span
                    data-carry-base={period.key}
                    className="absolute inset-x-0 h-0 border-t-2 border-dashed border-ink-muted"
                    style={{ bottom: `${base}%` }}
                  />
                ) : null}
                {effective !== null ? (
                  <span
                    data-carry-effective={period.key}
                    className="absolute inset-x-0 h-0.5 bg-ink transition-[bottom] duration-200 ease-out"
                    style={{ bottom: `${effective}%` }}
                  />
                ) : null}
              </span>
            </div>
          )
        })}
      </div>

      <div
        aria-hidden="true"
        className="tnum mt-1 grid font-mono text-xs text-ink-faint"
        style={{ gridTemplateColumns: `repeat(${wire.length}, minmax(0, 1fr))` }}
      >
        {wire.map((w, i) => (
          <span key={w.key} className="overflow-hidden text-center leading-tight">
            {w.tick}
            {monthTurns[i] ? <span className="block font-sans">{monthTurns[i]}</span> : null}
          </span>
        ))}
      </div>

      <div className="sr-only">
        <table>
          <caption>
            Terpakai per {PERIOD_WORD[per]} dengan sisa {POLICY_LONG[run.policy].toLowerCase()}
          </caption>
          <thead>
            <tr>
              <th scope="col">Periode</th>
              <th scope="col">Anggaran dasar</th>
              <th scope="col">Bawaan</th>
              <th scope="col">Anggaran efektif</th>
              <th scope="col">Terpakai</th>
              <th scope="col">Keadaan</th>
            </tr>
          </thead>
          <tbody>
            {run.periods.map((period) => (
              <tr key={period.key}>
                <th scope="row">{labelOf(period.key)}</th>
                <td>{period.base === null ? 'tidak dianggarkan' : money(period.base)}</td>
                <td>{money(period.carryIn)}</td>
                <td>{period.effective === null ? 'tidak dianggarkan' : money(period.effective)}</td>
                <td>{money(period.used)}</td>
                <td>
                  {STATUS_TEXT[period.status]}
                  {period.open ? ', masih berjalan' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Readout({ period, label }: { period: CarryPeriod | null; label: string }) {
  if (!period) return null
  return (
    <dl className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-line pb-3 text-sm">
      <div className="flex items-baseline gap-2">
        <dt className="sr-only">Periode</dt>
        <dd className="font-medium text-ink">
          {label}
          {period.open ? <span className="ml-1.5 text-xs font-normal text-ink-faint">berjalan</span> : null}
        </dd>
      </div>
      <div className="flex items-baseline gap-2">
        <dt className="text-xs text-ink-faint">Terpakai</dt>
        <dd className="tnum font-mono text-ink">{money(period.used)}</dd>
      </div>
      {period.effective === null ? (
        <div className="flex items-baseline gap-2">
          <dt className="sr-only">Anggaran</dt>
          <dd className="text-ink-faint">tidak dianggarkan</dd>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <dt className="text-xs text-ink-faint">Anggaran</dt>
            <dd className="tnum font-mono text-ink">
              {money(period.effective)}
              {period.carryIn !== 0n ? (
                <span className={`ml-1.5 text-xs ${period.carryIn > 0n ? 'text-under' : 'text-over'}`}>
                  {period.carryIn > 0n ? '+' : '−'}
                  {formatIdr(period.carryIn > 0n ? period.carryIn : -period.carryIn)}{' '}
                  <span className="font-sans">{period.carryIn > 0n ? 'sisa lalu' : 'minus lalu'}</span>
                </span>
              ) : null}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-xs text-ink-faint">{(period.left ?? 0n) < 0n ? 'Lewat' : 'Sisa'}</dt>
            <dd
              className={`tnum font-mono font-medium ${
                period.status === 'lewat' ? 'text-over' : 'text-ink'
              }`}
            >
              {period.status === 'lewat' ? <span aria-hidden="true">▲ </span> : null}
              {formatIdr((period.left ?? 0n) < 0n ? -(period.left ?? 0n) : (period.left ?? 0n))}
              {period.status === 'pakai-bawaan' ? (
                <span className="ml-1.5 font-sans text-xs font-normal text-ink-muted">
                  memakai sisa yang dibawa
                </span>
              ) : null}
            </dd>
          </div>
        </>
      )}
    </dl>
  )
}

function Legend() {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-3 w-2 rounded-t-[2px] bg-accent" />
        Terpakai
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-3 w-2 rounded-t-[2px] bg-over" />
        Lewat anggaran
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-0 w-4 border-t-2 border-dashed border-ink-muted" />
        Anggaran dasar
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-0.5 w-4 bg-ink" />
        Anggaran setelah sisa
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-3 w-4 bg-under/35" />
        Tambahan dari sisa
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-3 w-4 bg-over/30" />
        Potongan dari minus
      </li>
    </ul>
  )
}

function Comparison({
  runs,
  policy,
  per,
}: {
  runs: Record<CarryPolicy, CarryRun>
  policy: CarryPolicy
  per: CarryPer
}) {
  const word = PERIOD_WORD[per]
  return (
    <div className="mt-5">
      <h3 className="flex items-center gap-1 text-sm font-medium text-ink">
        Bandingkan tiga cara menutup {word}
        <InfoTip label="Arti tiap cara">
          Bawa: sisa atau minus pindah ke anggaran {word} berikutnya. Tabung: sisa masuk tabungan,
          minus ditutup dari tabungan sejauh cukup dan kekurangannya tetap dibawa. Biarkan: tiap{' '}
          {word} mulai dari anggaran dasarnya lagi. Transaksinya sama, hanya cara menutupnya yang beda.
        </InfoTip>
      </h3>
      <div className="mt-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-faint">
              <th scope="col" className="py-1.5 pr-3 text-left font-medium">
                Cara
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Lewat
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                {PER_LABEL[per]} ini
              </th>
              <th scope="col" className="py-1.5 pl-2 text-right font-medium">
                Tabungan
              </th>
            </tr>
          </thead>
          <tbody>
            {CARRY_POLICIES.map((p) => {
              const run = runs[p]
              const current = run.periods.find((period) => period.open) ?? run.periods[run.periods.length - 1]
              const chosen = p === policy
              return (
                <tr
                  key={p}
                  data-carry-compare={p}
                  aria-current={chosen ? 'true' : undefined}
                  className={`border-t border-line ${chosen ? 'font-medium text-ink' : 'text-ink-muted'}`}
                >
                  <th scope="row" className="py-2 pr-2 text-left font-[inherit]">
                    <span aria-hidden="true">{POLICY_LABEL[p]}</span>
                    <span className="sr-only">{POLICY_LONG[p]}</span>
                    {chosen ? <span className="sr-only"> (yang digambar)</span> : null}
                  </th>
                  <td className="tnum px-2 py-2 text-right font-mono">
                    {run.over} dari {run.budgeted}
                  </td>
                  <td className="tnum px-2 py-2 text-right font-mono">
                    {current?.effective == null ? 'tidak ada' : money(current.effective)}
                  </td>
                  <td className="tnum py-2 pl-2 text-right font-mono">
                    {p === 'tabung' ? formatIdr(run.saved) : <span className="text-ink-faint">tidak ada</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WeeklyForm({
  categoryId,
  name,
  weeks,
  rows,
}: {
  categoryId: string
  name: string
  weeks: CarryPeriodWire[]
  rows: CarrySeries['weeklyRows']
}) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(saveWeeklyBudget, null)
  useActionToast(result, pending)
  // The running week by default; any week in the window can be chosen.
  const running = weeks.find((w) => w.open)?.key ?? weeks[weeks.length - 1]?.key ?? ''
  const [weekStart, setWeekStart] = useState(running)
  const [scope, setScope] = useState<'seterusnya' | 'minggu-ini'>('seterusnya')
  const existing = rows.find((r) => r.weekStart === weekStart && r.ongoing === (scope === 'seterusnya'))
  const current = weeks.find((w) => w.key === weekStart)
  // What the field starts from: the row this would replace, else the figure
  // the week already carries. Re-seeded when the week or scope changes, and
  // when a save brings a new row back from the server.
  const seed = existing?.amount ?? current?.base ?? '0'
  const seedKey = `${weekStart}|${scope}|${seed}`
  const [seeded, setSeeded] = useState(seedKey)
  const [amount, setAmount] = useState<bigint>(BigInt(seed))
  if (seeded !== seedKey) {
    setSeeded(seedKey)
    setAmount(BigInt(seed))
  }
  const weekId = useId()

  return (
    <form action={action} className="mt-5 border-t border-line pt-4">
      <h3 className="text-sm font-medium text-ink">Anggaran mingguan {name}</h3>
      <input type="hidden" name="categoryId" value={categoryId} />
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={weekId} className="text-xs text-ink-muted">
            Minggu
          </label>
          <select
            id={weekId}
            name="weekStart"
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
            className={`${CONTROL} mt-1`}
          >
            {weeks
              .slice()
              .reverse()
              .map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label}
                  {w.open && w.key === running ? ' (minggu ini)' : ''}
                </option>
              ))}
          </select>
        </div>
        <MoneyInput label="Anggaran per minggu" name="amount" value={amount} onChange={setAmount} />
      </div>
      <fieldset className="mt-3">
        <legend className="text-xs text-ink-muted">Berlaku</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {(
            [
              ['seterusnya', 'Seterusnya'],
              ['minggu-ini', 'Sekali ini'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-line bg-paper px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong"
            >
              <input
                type="radio"
                name="scope"
                value={value}
                checked={scope === value}
                onChange={() => setScope(value)}
                className={`${CHIP_RADIO} accent-[var(--color-accent)]`}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? 'Menyimpan…' : 'Simpan'}
        </button>
        {existing ? (
          <button type="submit" name="hapus" value="1" disabled={pending} className={BUTTON_PLAIN}>
            Hapus
          </button>
        ) : null}
      </div>
    </form>
  )
}
