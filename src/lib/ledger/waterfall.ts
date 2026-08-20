import type { MonthlyStatement } from './monthly'

/**
 * The Monthly Statement formula, turned into a sequence of steps.
 *
 * This is the one calculation the whole app rests on:
 *
 *   Saldo awal + Income + Dari Asset
 *     − Invest − Bills − Sinking Fund − Goals − Cicilan − Spending − Piutang
 *     = Sisa uang
 *
 * In the spreadsheet it is a column of numbers, and reconciling it means reading
 * eleven figures and holding a running total in your head. Every term here
 * carries the total it produced, so the chart can show where the money actually
 * went instead of asking the reader to do the arithmetic again.
 *
 * The kinds and tones match `chart/sankey`, so a term keeps the same colour in
 * both charts on the dashboard.
 */

export type StepKind = 'anchor' | 'increase' | 'decrease'
export type StepTone = 'income' | 'spend' | 'save' | 'warn' | 'neutral'

export interface WaterfallStep {
  id: string
  label: string
  kind: StepKind
  tone: StepTone
  /** Signed contribution to the running total. Always zero on an anchor. */
  delta: bigint
  /** The running total once this step has been applied. */
  total: bigint
  /** The bar covers this range of the axis; `from` is always the lower end. */
  from: bigint
  to: bigint
}

/**
 * The terms between the two anchors, in the order the spreadsheet lists them.
 *
 * `sign` is the direction the term moves spendable money, which is not the same
 * as whether it is a good thing: money put into investments leaves the account
 * exactly as money spent on lunch does. The tone is what separates them, and it
 * is why direction is never carried by colour in this chart.
 */
const TERMS: {
  id: string
  label: string
  tone: StepTone
  sign: 1n | -1n
  of: (statement: MonthlyStatement) => bigint
}[] = [
  { id: 'income', label: 'Pemasukan', tone: 'income', sign: 1n, of: (s) => s.income },
  { id: 'from-asset', label: 'Cair dari aset', tone: 'income', sign: 1n, of: (s) => s.fromAsset },
  { id: 'invest', label: 'Investasi', tone: 'save', sign: -1n, of: (s) => s.investSavings },
  { id: 'bills', label: 'Tagihan', tone: 'spend', sign: -1n, of: (s) => s.bills },
  { id: 'sinking', label: 'Sinking fund', tone: 'save', sign: -1n, of: (s) => s.sinkingFund },
  { id: 'goals', label: 'Tujuan', tone: 'save', sign: -1n, of: (s) => s.financialGoals },
  { id: 'debt', label: 'Cicilan', tone: 'warn', sign: -1n, of: (s) => s.debtPayment },
  { id: 'spending', label: 'Pengeluaran', tone: 'spend', sign: -1n, of: (s) => s.spending },
]

export function buildWaterfall(statement: MonthlyStatement): WaterfallStep[] {
  const steps: WaterfallStep[] = []
  let running = statement.saldoAwal

  const anchor = (id: string, label: string, total: bigint): WaterfallStep => ({
    id,
    label,
    kind: 'anchor',
    tone: 'neutral',
    delta: 0n,
    total,
    from: total < 0n ? total : 0n,
    to: total < 0n ? 0n : total,
  })

  function step(id: string, label: string, tone: StepTone, delta: bigint) {
    // A term worth nothing this month gets no row. A row a pixel wide labelled
    // Rp0 costs the reader the same attention as a real one and repays none of it.
    if (delta === 0n) return
    const before = running
    running += delta
    steps.push({
      id,
      label,
      tone,
      kind: delta > 0n ? 'increase' : 'decrease',
      delta,
      total: running,
      from: before < running ? before : running,
      to: before < running ? running : before,
    })
  }

  steps.push(anchor('opening', 'Saldo awal', running))

  for (const term of TERMS) step(term.id, term.label, term.tone, term.sign * term.of(statement))

  /*
    Piutang is the only term whose direction the month decides. It is lending
    minus repayment, so a month where more came back than went out returns money
    to the pot, and calling that "Piutang baru" would be a lie in the label as
    well as in the arrow.
  */
  if (statement.piutang !== 0n) {
    step(
      'piutang',
      statement.piutang > 0n ? 'Dipinjamkan' : 'Piutang kembali',
      'warn',
      -statement.piutang,
    )
  }

  steps.push(anchor('closing', 'Sisa uang', running))

  return steps
}

/** The lowest and highest points the running total reaches, for the axis. */
export function waterfallBounds(steps: WaterfallStep[]): { low: bigint; high: bigint } {
  let low = 0n
  let high = 0n
  for (const { from, to } of steps) {
    if (from < low) low = from
    if (to > high) high = to
  }
  return { low, high }
}
