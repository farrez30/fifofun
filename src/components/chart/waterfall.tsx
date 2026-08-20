import { buildSpanScale, type SpanScale } from '@/lib/ledger/scale'
import {
  buildWaterfall,
  waterfallBounds,
  type StepTone,
  type WaterfallStep,
} from '@/lib/ledger/waterfall'
import type { MonthlyStatement } from '@/lib/ledger/monthly'
import { formatIdr, formatIdrCompact } from '@/lib/money'
import { Money, SignedMoney } from '@/components/money'
import { nudge } from './axis'

/**
 * How Saldo awal became Sisa uang.
 *
 * The spreadsheet states this as a column of eleven figures with the answer at
 * the bottom, and checking it means holding a running total in your head all
 * the way down. A waterfall does the holding: each bar starts where the last
 * one finished, so the running total is a position on the axis rather than
 * something the reader recomputes at every line.
 *
 * Colour carries what kind of term it is, never which way it moved. Money put
 * into investments leaves the account exactly as money spent on lunch does, and
 * painting it red would say something about the household's choices this chart
 * has no business saying. Direction is carried three other ways: the bar grows
 * from a different edge, the amount has a sign, and the row has an arrow.
 */

const TONE_FILL: Record<StepTone, string> = {
  income: 'var(--color-under)',
  spend: 'var(--color-accent)',
  save: 'var(--color-accent-strong)',
  warn: 'var(--color-warn)',
  neutral: 'var(--color-line-strong)',
}

/**
 * A gutter carrying the label and its amount, then the plot. Shared by the axis
 * strip and every row.
 *
 * The amount used to sit in a third column on the right, which read well on a
 * desktop and put every figure off the side of a phone: the chart needed six
 * hundred pixels to lay out, so what a narrow screen showed first was a stack
 * of labels with no numbers beside them. Pairing each amount with its own label
 * costs a line of height and fits inside three hundred and twenty pixels.
 */
const COLUMNS = 'grid grid-cols-[6.5rem_1fr] gap-x-3 sm:grid-cols-[9rem_1fr]'

interface Props {
  statement: MonthlyStatement
  caption: string
}

export function Waterfall({ statement, caption }: Props) {
  const steps = buildWaterfall(statement)

  if (steps.length === 2 && steps[0].total === 0n && steps[1].total === 0n) {
    return (
      <figure className="border border-line bg-surface p-6">
        <figcaption className="text-sm font-medium text-ink">{caption}</figcaption>
        <p className="mt-2 text-sm text-ink-muted">
          Belum ada uang yang bergerak bulan ini, jadi tidak ada yang bisa diurutkan.
        </p>
      </figure>
    )
  }

  const { low, high } = waterfallBounds(steps)
  const scale = buildSpanScale(low, high)
  const opening = steps[0]
  const closing = steps[steps.length - 1]
  const change = closing.total - opening.total

  return (
    <figure className="border border-line bg-surface p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-ink">{caption}</span>
        <span className="text-xs text-ink-muted">
          {formatIdrCompact(opening.total)} menjadi {formatIdrCompact(closing.total)},{' '}
          {change === 0n
            ? 'tidak berubah'
            : `${change > 0n ? 'naik' : 'turun'} ${formatIdrCompact(change < 0n ? -change : change)}`}
        </span>
      </figcaption>

      {/* The axis sits above the rows on the same grid, so each label lands on
          the gridline it names. */}
      <div className={`${COLUMNS} items-end`}>
        <span />
        <div className="relative h-4">
          {scale.ticks.map((tick, index) => {
            const pct = scale.percentOf(tick)
            /*
              On a phone the plot is under two hundred pixels wide, and five
              labels of "Rp30jt" do not fit in it: the top two ran into each
              other and printed "Rp30jtRp40jt". Narrow screens keep the two ends
              and the middle, which cannot collide at any width this chart is
              readable at, and every gridline stays where it was. Dropping
              alternate labels instead looks tidier on paper and still collides,
              because "Rp12,5jt" is twice the width of "0".
            */
            const last = scale.ticks.length - 1
            const crowded = index !== 0 && index !== last && index !== Math.floor(last / 2)
            return (
              <span
                key={String(tick)}
                className={`absolute bottom-0 whitespace-nowrap text-[0.625rem] leading-none text-ink-faint ${
                  crowded ? 'hidden sm:block' : ''
                }`}
                style={{ left: `${pct}%`, transform: nudge(pct) }}
              >
                {tick === 0n ? '0' : formatIdrCompact(tick)}
              </span>
            )
          })}
        </div>
      </div>

      {/* No gaps between the rows: the gridline segment inside each plot cell
          meets the one below it and reads as a single line down the chart,
          without any of them needing to know the row height. */}
      <ol>
        {steps.map((step, index) => (
          <Row
            key={step.id}
            step={step}
            previous={index === 0 ? null : steps[index - 1]}
            scale={scale}
          />
        ))}
      </ol>

      <p className="mt-3 text-xs text-ink-muted">
        Warnanya menandai jenis posnya, bukan baik atau buruknya. Uang yang masuk investasi tetap
        keluar dari saldo, sama seperti uang belanja, dan arah tiap langkah dibaca dari panah serta
        tandanya.
      </p>

      {/*
        Wrapped rather than marked directly: a table ignores the one pixel width
        that sr-only sets and lays itself out to fit its content, which stretches
        the whole document sideways.
      */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Pos</th>
              <th scope="col">Perubahan</th>
              <th scope="col">Saldo setelahnya</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.id}>
                <th scope="row">{step.label}</th>
                <td>
                  {step.kind === 'anchor'
                    ? 'tidak ada'
                    : `${step.delta > 0n ? 'masuk' : 'keluar'} ${formatIdr(
                        step.delta < 0n ? -step.delta : step.delta,
                      )}`}
                </td>
                <td>{formatIdr(step.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

function Row({
  step,
  previous,
  scale,
}: {
  step: WaterfallStep
  previous: WaterfallStep | null
  scale: SpanScale
}) {
  const left = scale.percentOf(step.from)
  const right = scale.percentOf(step.to)
  const anchor = step.kind === 'anchor'
  const size = step.delta < 0n ? -step.delta : step.delta

  return (
    <li className={`${COLUMNS} items-center`}>
      <div className="min-w-0 py-1">
        <p
          className={`truncate text-sm leading-5 ${anchor ? 'font-medium text-ink' : 'text-ink'}`}
          title={step.label}
        >
          {step.label}
        </p>
        <p className="text-xs leading-4">
          {anchor ? (
            <Money sen={step.total} className="font-medium text-ink" />
          ) : (
            <>
              {/* The arrow rides with the amount rather than the label: it is
                  the movement it describes, and a label gutter this narrow has
                  no room to spare. */}
              <span aria-hidden="true" className="mr-0.5 text-ink-faint">
                {step.kind === 'increase' ? '▲' : '▼'}
              </span>
              <SignedMoney sen={size} direction={step.kind === 'increase' ? 'in' : 'out'} />
            </>
          )}
        </p>
      </div>

      <div className="relative h-11">
        {scale.ticks.map((tick) => (
          <div
            key={String(tick)}
            aria-hidden="true"
            className={`absolute inset-y-0 w-px ${tick === 0n ? 'bg-line-strong' : 'bg-line'}`}
            style={{ left: `${scale.percentOf(tick)}%` }}
          />
        ))}

        {/* Where the previous bar finished. Without it the eye has to guess
            whether this bar continues the last one or starts somewhere new.

            Only the half above the bar, so it reads as coming down from the row
            before. Run the full height and it becomes another gridline, sitting
            at a value the axis never names. */}
        {previous ? (
          <div
            aria-hidden="true"
            data-continues-from={previous.id}
            className="absolute top-0 h-1/2 w-px bg-line-strong"
            style={{ left: `${scale.percentOf(previous.total)}%` }}
          />
        ) : null}

        <div
          data-step={step.id}
          className={`absolute top-1/2 -translate-y-1/2 ${anchor ? 'h-6' : 'h-4'}`}
          style={{
            left: `${left}%`,
            // Never thinner than a hairline: a term worth a few thousand rupiah
            // beside a peak of twelve million rounds to nothing and vanishes,
            // and a labelled row with no bar reads as a rendering fault.
            width: `max(2px, ${right - left}%)`,
            backgroundColor: TONE_FILL[step.tone],
          }}
        />
      </div>
    </li>
  )
}
