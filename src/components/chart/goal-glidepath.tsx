'use client'

import { buildScale } from '@/lib/ledger/scale'
import {
  buildGlidepath,
  MAX_HORIZON_YEARS,
  type Glidepath,
  type GlidepathPoint,
} from '@/lib/planning/glidepath'
import { formatIdr, formatIdrCompact } from '@/lib/money'
import { nudge } from './axis'
import { DragAxis, DragPin, slotFraction } from './drag-axis'

/**
 * A goal from today until it is paid for, drawn twice.
 *
 * The panel already prints what the return contributes as a rupiah figure, and
 * that figure is the one number on the page nobody can feel. Half a milliard is
 * not an amount anybody has an instinct for. So the same fact is drawn instead:
 * one curve where the money earns its instrument's return, one where the
 * identical contributions sit in a drawer, and the gap between where each of
 * them meets the target measured off along the target itself. That reading is
 * in years, and a household already knows what a year is worth.
 *
 * The marker on the year axis is the plan's own deadline, and dragging it is the
 * argument. Pulling it left stands the curve up and the instalment jumps;
 * pushing it right flattens the curve and the return quietly takes over more of
 * the work. Neither of those is legible from a form with a number in it.
 *
 * Both curves come from `futureBalance`, the same closed form the instalment was
 * solved out of, so the picture and the figure beside it cannot disagree.
 */

interface Props {
  target: bigint
  /** What goes in at the end of every month. */
  monthly: bigint
  annualRate: number
  currentYear: number
  /** The plan's length in years, and where the marker sits. */
  years: number
  startingBalance?: bigint
  /** Omit to draw the chart without a marker, as a plain picture of the plan. */
  onYearsChange?: (years: number) => void
  caption: string
}

/**
 * Room kept above the top gridline, as a percentage of the plot.
 *
 * Both curves finish on the target, so whichever mark sits highest sits exactly
 * on a gridline. Without this the two arrival dots would be sliced in half by
 * the edge of the box, which reads as a clipping fault rather than as a value
 * at the top of its range.
 */
const CEILING = 6

/** Years past two of them, months below, matching how the rest of the app speaks. */
function spanOf(months: number): string {
  if (months < 24) return `${months} bulan`
  return `${Math.round(months / 12)} tahun`
}

export function GoalGlidepath({
  target,
  monthly,
  annualRate,
  currentYear,
  years,
  startingBalance = 0n,
  onYearsChange,
  caption,
}: Props) {
  const path = buildGlidepath({
    target,
    monthly,
    annualRate,
    currentYear,
    years,
    startingBalance,
  })

  const { points, invested, idle } = path

  /*
    A goal already paid for has no journey to draw, and drawing one anyway
    produced an empty plot with both markers stacked in the top corner and their
    labels written over each other: a chart that looks broken rather than one
    that looks finished. The sentence is the whole answer here, so it is given
    on its own, along with what the surplus could be doing instead.
  */
  if (invested !== null && invested.months === 0) {
    const surplus = startingBalance - target
    return (
      <figure className="border border-line bg-surface p-4">
        <figcaption className="text-sm font-medium text-ink">{caption}</figcaption>
        <p className="mt-2 text-sm text-ink-muted">
          <Verdict path={path} />
        </p>
        {surplus > 0n ? (
          <p className="mt-1 text-sm text-ink-muted">
            Kelebihannya {formatIdr(surplus)}. Itu uang menganggur terhadap tujuan ini, dan
            lebih berguna dipindahkan ke tujuan berikutnya.
          </p>
        ) : null}
      </figure>
    )
  }

  const scale = buildScale(path.peak, 4)

  /*
    Positions come from the drag axis rather than from `index / (n - 1)`, so the
    marker and the curve are placed by one rule. The axis puts slot i at the
    middle of its column; a curve laid out edge to edge would sit half a column
    off from the marker at both ends, a mismatch that reads as a bug in the
    projection when it is really a disagreement about geometry.
  */
  const xAt = (index: number) => slotFraction(index, points.length) * 100
  const xAtMonth = (months: number) => xAt(months / 12)
  const yAt = (value: bigint) => CEILING + (100 - scale.percentOf(value)) * ((100 - CEILING) / 100)

  const targetY = yAt(target)

  // Positions kept alongside the values, so that filtering a series short of the
  // horizon cannot shift the rest of it sideways. Where a sample sits belongs to
  // its year, not to its place in whatever subset is being drawn.
  const placed = points.map((point, index) => ({ point, x: xAt(index) }))

  /*
    Each series is drawn only for as long as it is still being paid into, and is
    then closed with the exact month it arrives rather than the year sample after
    it. Ending on the last whole year would leave the line stopping short of the
    target it demonstrably reaches, which is the one thing this picture must not
    do.
  */
  function trace(pick: (point: GlidepathPoint) => bigint | null, arrival: number | null): string {
    const drawn = placed
      .filter(({ point }) => pick(point) !== null)
      .map(({ point, x }) => `${x},${yAt(pick(point)!)}`)
    // Skipped when the arrival lands on a year boundary, where the sample is
    // already that point and repeating it puts a zero length segment in the path.
    const end = arrival === null ? null : `${xAtMonth(arrival)},${targetY}`
    if (end !== null && end !== drawn.at(-1)) drawn.push(end)
    return drawn.join(' ')
  }

  const investedLine = trace((point) => point.invested, invested?.months ?? null)
  const idleLine = trace((point) => point.idle, idle?.months ?? null)

  /*
    The band is the return itself: the invested curve above, the same
    contributions earning nothing below, closed back along the lower edge. It
    only means anything because this axis starts at zero, and it stops where the
    invested curve does, since past that point there is no longer a contribution
    for the return to be measured against.
  */
  const band =
    invested === null
      ? ''
      : `${investedLine} ${placed
          .filter(({ point }) => point.idle !== null && point.monthsIn <= invested.months)
          .reverse()
          .map(({ point, x }) => `${x},${yAt(point.idle!)}`)
          .join(' ')}`

  // One label a year stops fitting somewhere past a decade, and the two ends
  // are the ones that carry the range.
  const labelEvery = Math.ceil(points.length / 9)

  return (
    <figure className="border border-line bg-surface p-4">
      <figcaption className="mb-1 text-sm font-medium text-ink">{caption}</figcaption>
      <p className="mb-4 text-xs text-ink-muted">
        <Verdict path={path} />
      </p>

      <div className="grid grid-cols-[3.5rem_1fr] gap-x-2">
        <div className="relative">
          {scale.ticks.map((tick) => (
            <span
              key={String(tick)}
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[0.625rem] leading-none text-ink-faint"
              style={{ top: `${yAt(tick)}%` }}
            >
              {formatIdrCompact(tick)}
            </span>
          ))}
        </div>

        <div className="relative h-52">
          {scale.ticks.map((tick) => (
            <div
              key={String(tick)}
              aria-hidden="true"
              className={`absolute inset-x-0 h-px ${tick === 0n ? 'bg-line-strong' : 'bg-line'}`}
              style={{ top: `${yAt(tick)}%` }}
            />
          ))}

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {band ? <polygon points={band} fill="var(--color-under-wash)" /> : null}
            {/*
              Dashed and thin against solid and thick. The two curves have to be
              separable by somebody who cannot separate the two hues, and a
              legend that only works in colour works for most people rather than
              for everybody.
            */}
            <polyline
              points={idleLine}
              fill="none"
              stroke="var(--color-line-strong)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={investedLine}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* The target is a value rather than a gridline, so it is drawn as one
              of the marks and not as part of the axis. Labelled on the left,
              which is the one part of the plot both curves are always below. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-dashed border-accent-strong"
            style={{ top: `${targetY}%` }}
          />
          {/* Dropped when the axis already tops out at the target, which is the
              common case now that nothing is drawn above it. Naming the same
              figure twice, a centimetre apart, reads as two different values. */}
          {scale.top === target ? null : (
            <span
              className="absolute left-0 -translate-y-full pb-0.5 text-[0.625rem] leading-none text-accent-strong"
              style={{ top: `${targetY}%` }}
            >
              Target {formatIdrCompact(target)}
            </span>
          )}

          {/* Both arrivals sit on the target by definition, so the distance
              between them along it is the wait the return takes off. Measured
              off on the chart rather than asserted in a sentence. */}
          {invested && idle && idle.months > invested.months ? (
            <>
              <div
                data-earned={String(path.monthsEarned ?? 0)}
                aria-hidden="true"
                className="absolute h-1.5 border-x-2 border-surface bg-under"
                style={{
                  top: `${targetY}%`,
                  left: `${xAtMonth(invested.months)}%`,
                  width: `${xAtMonth(idle.months) - xAtMonth(invested.months)}%`,
                }}
              />
              <span
                className="absolute translate-y-1.5 whitespace-nowrap text-[0.625rem] leading-none text-under"
                style={{ top: `${targetY}%`, left: `${xAtMonth(invested.months) + 1}%` }}
              >
                {spanOf(path.monthsEarned ?? 0)} lebih cepat
              </span>
            </>
          ) : null}

          {invested ? (
            <Marker
              x={xAtMonth(invested.months)}
              y={targetY}
              tone="bg-accent"
              title={`Tercapai ${invested.year}, setelah ${spanOf(invested.months)}`}
              tag="arrival-invested"
            />
          ) : null}
          {idle ? (
            <Marker
              x={xAtMonth(idle.months)}
              y={targetY}
              tone="bg-line-strong"
              title={`Kalau hanya didiamkan, tercapai ${idle.year}`}
              tag="arrival-idle"
            />
          ) : null}
        </div>

        <span />
        <div className="relative mt-1.5 h-3">
          {points.map((point, index) => {
            const last = index === points.length - 1
            if (index % labelEvery !== 0 && !last) return null
            // Two labels landing on each other at the right hand end is worse
            // than one of them being dropped.
            if (!last && points.length - 1 - index < labelEvery / 2) return null
            const pct = xAt(index)
            return (
              <span
                key={point.year}
                className="absolute top-0 whitespace-nowrap tabular-nums text-[0.625rem] leading-none text-ink-faint"
                style={{ left: `${pct}%`, transform: nudge(pct) }}
              >
                {index === 0 ? point.year : `'${String(point.year).slice(2)}`}
              </span>
            )
          })}
        </div>

        {onYearsChange ? (
          <>
            <span />
            <DragAxis values={points.map((point) => point.year)} className="h-9 w-full">
              <DragPin
                value={currentYear + years}
                onChange={(year) => onYearsChange(Math.max(1, year - currentYear))}
                label="Tahun target tercapai"
                format={(year) => String(year)}
              />
            </DragAxis>
          </>
        ) : null}
      </div>

      {onYearsChange ? (
        <p className="mt-1 text-xs text-ink-muted">
          Seret penanda tahunnya, atau pilih lalu pakai tombol panah. Setoran bulanannya ikut
          berubah, dan begitu juga bagian yang tidak perlu kamu setorkan sendiri.
        </p>
      ) : null}

      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-faint">
        Imbal hasil {(annualRate * 100).toFixed(1).replace('.', ',')}% per tahun dipakai rata
        sepanjang jangka. Pasar tidak bergerak begitu. Ini proyeksi, bukan janji, dan tahun buruk
        yang jatuh dekat tenggat jauh lebih menyakitkan daripada yang jatuh di awal.
      </p>

      {/* Wrapped, because a table ignores the one pixel width sr-only sets. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Tahun</th>
              <th scope="col">Dengan imbal hasil</th>
              <th scope="col">Kalau hanya ditabung</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.year}>
                <th scope="row">{point.year}</th>
                <td>{point.invested === null ? 'Sudah tercapai' : formatIdr(point.invested)}</td>
                <td>{point.idle === null ? 'Sudah tercapai' : formatIdr(point.idle)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

function Marker({
  x,
  y,
  tone,
  title,
  tag,
}: {
  x: number
  y: number
  tone: string
  title: string
  tag: string
}) {
  return (
    <div
      data-mark={tag}
      title={title}
      className={`absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface ${tone}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    />
  )
}

/**
 * The sentence under the caption, and the only place the chart makes a claim.
 *
 * Four genuinely different situations rather than one sentence with holes in it:
 * a goal already covered, a goal nothing will reach, a goal where leaving the
 * money still would also get there eventually, and a goal where it never would.
 * That last one is the strongest thing this chart can say, and it would be lost
 * inside a template.
 */
function Verdict({ path }: { path: Glidepath }) {
  const { invested, idle, monthly, monthsEarned } = path

  if (invested === null) {
    return (
      <>
        Dengan {formatIdr(monthly)} per bulan, targetnya tidak tercapai dalam{' '}
        {MAX_HORIZON_YEARS} tahun. Perpanjang jangkanya atau naikkan setorannya.
      </>
    )
  }

  if (invested.months === 0) {
    return <>Targetnya sudah tertutup oleh yang sudah terkumpul. Tidak ada yang perlu disetor.</>
  }

  const opening = `${formatIdr(monthly)} per bulan sampai ${invested.year}`

  if (idle === null) {
    return (
      <>
        {opening}. Uang yang sama, kalau hanya didiamkan, tidak sampai ke sana dalam{' '}
        {MAX_HORIZON_YEARS} tahun sekalipun. Sebagian besar targetnya dikerjakan oleh imbal
        hasil, bukan oleh setoranmu.
      </>
    )
  }

  return (
    <>
      {opening}. Setoran yang sama tanpa imbal hasil baru sampai {idle.year}, jadi imbal hasilnya
      bernilai {spanOf(monthsEarned ?? 0)}.
    </>
  )
}
