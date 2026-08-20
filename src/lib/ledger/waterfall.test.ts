import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import type { MonthlyStatement } from './monthly'
import { buildWaterfall, waterfallBounds } from './waterfall'

function statement(over: Partial<MonthlyStatement> = {}): MonthlyStatement {
  const base: MonthlyStatement = {
    saldoAwal: 0n,
    income: 0n,
    fromAsset: 0n,
    investSavings: 0n,
    bills: 0n,
    sinkingFund: 0n,
    financialGoals: 0n,
    debtPayment: 0n,
    spending: 0n,
    piutang: 0n,
    sisaUang: 0n,
    ...over,
  }
  const sisaUang =
    base.saldoAwal +
    base.income +
    base.fromAsset -
    base.investSavings -
    base.bills -
    base.sinkingFund -
    base.financialGoals -
    base.debtPayment -
    base.spending -
    base.piutang
  return { ...base, sisaUang }
}

/** February 2026, the month where a receivable came back. */
const FEBRUARY = statement({
  saldoAwal: idr('3.398.413,00'),
  income: idr('8.171.629,00'),
  bills: idr('2.690.151,00'),
  spending: idr('3.830.737,00'),
  piutang: -idr('102.000,00'),
})

describe('buildWaterfall', () => {
  it('lands on the same Sisa uang the statement did', () => {
    const steps = buildWaterfall(FEBRUARY)
    const closing = steps[steps.length - 1]

    expect(closing.id).toBe('closing')
    expect(closing.total).toBe(idr('5.151.154,00'))
    expect(closing.total).toBe(FEBRUARY.sisaUang)
  })

  it('opens on Saldo awal and closes on Sisa uang', () => {
    const steps = buildWaterfall(FEBRUARY)
    expect(steps[0].id).toBe('opening')
    expect(steps[0].total).toBe(FEBRUARY.saldoAwal)
    expect(steps[0].kind).toBe('anchor')
    expect(steps[steps.length - 1].kind).toBe('anchor')
  })

  it('leaves out the terms that were nothing this month', () => {
    const ids = buildWaterfall(FEBRUARY).map((step) => step.id)
    expect(ids).toEqual(['opening', 'income', 'bills', 'spending', 'piutang', 'closing'])
  })

  it('reads a repaid receivable as money coming back, not going out', () => {
    const [step] = buildWaterfall(FEBRUARY).filter((s) => s.id === 'piutang')
    expect(step.kind).toBe('increase')
    expect(step.label).toBe('Piutang kembali')
    expect(step.delta).toBe(idr('102.000,00'))
  })

  it('reads money lent out as money going out', () => {
    const march = statement({
      saldoAwal: idr('5.151.154,00'),
      income: idr('6.172.514,00'),
      bills: idr('532.883,00'),
      spending: idr('8.287.460,00'),
      piutang: idr('52.500,00'),
    })
    const steps = buildWaterfall(march)
    const lent = steps.find((step) => step.id === 'piutang')

    expect(lent?.kind).toBe('decrease')
    expect(lent?.label).toBe('Dipinjamkan')
    expect(lent?.delta).toBe(-idr('52.500,00'))
    expect(steps[steps.length - 1].total).toBe(idr('2.450.825,00'))
  })

  it('chains every step onto the one before it', () => {
    const steps = buildWaterfall(FEBRUARY)
    for (let i = 1; i < steps.length; i++) {
      const previous = steps[i - 1]
      const step = steps[i]
      if (step.kind === 'anchor') {
        expect(step.total).toBe(previous.total)
        continue
      }
      expect(previous.total + step.delta).toBe(step.total)
      // The bar has to cover exactly the ground between the two totals, or it
      // draws a change of a different size from the one it is labelled with.
      expect(step.to - step.from).toBe(step.delta < 0n ? -step.delta : step.delta)
    }
  })

  it('draws an anchor from zero, so its length is the balance itself', () => {
    const steps = buildWaterfall(FEBRUARY)
    expect(steps[0].from).toBe(0n)
    expect(steps[0].to).toBe(FEBRUARY.saldoAwal)
  })

  it('keeps the chain honest when the month ends overdrawn', () => {
    const broke = statement({
      saldoAwal: idr('200.000,00'),
      income: idr('100.000,00'),
      spending: idr('900.000,00'),
    })
    const steps = buildWaterfall(broke)
    const closing = steps[steps.length - 1]

    expect(closing.total).toBe(-idr('600.000,00'))
    // Below zero the anchor grows downward from the axis rather than upward.
    expect(closing.from).toBe(-idr('600.000,00'))
    expect(closing.to).toBe(0n)
  })

  it('gives an untouched month its two anchors and nothing else', () => {
    const ids = buildWaterfall(statement()).map((step) => step.id)
    expect(ids).toEqual(['opening', 'closing'])
  })
})

describe('waterfallBounds', () => {
  it('spans everything the running total touched, and always zero', () => {
    const bounds = waterfallBounds(buildWaterfall(FEBRUARY))
    expect(bounds.low).toBe(0n)
    // The peak is reached after income lands, before anything is paid out.
    expect(bounds.high).toBe(idr('3.398.413,00') + idr('8.171.629,00'))
  })

  it('reaches below zero when the month does', () => {
    const bounds = waterfallBounds(
      buildWaterfall(statement({ saldoAwal: idr('200.000,00'), spending: idr('900.000,00') })),
    )
    expect(bounds.low).toBe(-idr('700.000,00'))
    expect(bounds.high).toBe(idr('200.000,00'))
  })
})
