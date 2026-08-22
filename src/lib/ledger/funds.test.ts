import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import { addMonths, monthsBetween, reviewFunds, type FundCategory } from './funds'
import type { CashflowType, LedgerEntry } from './types'

let seq = 0
function row(
  month: string,
  category: string,
  amount: bigint,
  cashflow: CashflowType,
): LedgerEntry & { categoryName: string } {
  seq += 1
  return {
    id: `f${seq}`,
    occurredAt: new Date(`${month}-15T05:00:00.000Z`),
    description: category,
    amount,
    cashflow,
    categoryId: null,
    fromAccountId: null,
    toAccountId: null,
    source: 'manual',
    categoryName: category,
  }
}

const GOALS: FundCategory[] = [
  {
    name: 'Dana Menikah',
    cashflow: 'financial_goal',
    openingBalance: 0n,
    target: idr('50.000.000,00'),
    targetMonth: '2027-03',
  },
  {
    name: 'Dana Rumah',
    cashflow: 'financial_goal',
    openingBalance: idr('10.000.000,00'),
    target: idr('200.000.000,00'),
    targetMonth: null,
  },
  { name: 'Tabungan', cashflow: 'invest_savings', openingBalance: 0n, target: null, targetMonth: null },
]

const LEDGER = [
  row('2026-01', 'Dana Menikah', idr('2.000.000,00'), 'financial_goal'),
  row('2026-02', 'Dana Menikah', idr('2.000.000,00'), 'financial_goal'),
  row('2026-03', 'Dana Menikah', idr('2.000.000,00'), 'financial_goal'),
  row('2026-01', 'Dana Rumah', idr('1.000.000,00'), 'financial_goal'),
  row('2026-03', 'Dana Rumah', idr('3.000.000,00'), 'financial_goal'),
  row('2026-02', 'Tabungan', idr('500.000,00'), 'invest_savings'),
]

describe('reviewFunds', () => {
  it('counts what went in and what came back out', () => {
    const review = reviewFunds(
      [...LEDGER, row('2026-03', 'Dana Menikah', idr('1.500.000,00'), 'from_asset')],
      GOALS,
    )
    const wedding = review.funds.find((fund) => fund.name === 'Dana Menikah')

    expect(wedding?.contributed).toBe(idr('6.000.000,00'))
    expect(wedding?.withdrawn).toBe(idr('1.500.000,00'))
    expect(wedding?.saved).toBe(idr('4.500.000,00'))
  })

  it('starts from what the pot already held', () => {
    const house = reviewFunds(LEDGER, GOALS).funds.find((fund) => fund.name === 'Dana Rumah')
    expect(house?.saved).toBe(idr('14.000.000,00'))
  })

  it('measures the usual rate over the months it was fed, not every month', () => {
    const house = reviewFunds(LEDGER, GOALS).funds.find((fund) => fund.name === 'Dana Rumah')
    // Fed in January and March, not February. Averaging the empty month in
    // would halve the rate and promise a deadline twice as far away as the truth.
    expect(house?.monthlyRate).toBe(idr('1.000.000,00'))
    expect(house?.lastFed).toBe('2026-03')
  })

  it('says how much is left and how far along it is', () => {
    const wedding = reviewFunds(LEDGER, GOALS).funds.find((fund) => fund.name === 'Dana Menikah')
    expect(wedding?.saved).toBe(idr('6.000.000,00'))
    expect(wedding?.remaining).toBe(idr('44.000.000,00'))
    expect(wedding?.share).toBeCloseTo(12, 0)
  })

  it('never reports a target as more than met', () => {
    const done = reviewFunds(
      [row('2026-01', 'Pajak Kendaraan', idr('3.000.000,00'), 'sinking_fund')],
      [
        {
          name: 'Pajak Kendaraan',
          cashflow: 'sinking_fund',
          openingBalance: 0n,
          target: idr('2.000.000,00'),
          targetMonth: '2026-06',
        },
      ],
    )
    expect(done.funds[0].remaining).toBe(0n)
    expect(done.funds[0].monthsAtThisRate).toBe(0)
    expect(done.funds[0].onTrack).toBe(true)
  })

  it('works out what the deadline demands each month', () => {
    const wedding = reviewFunds(LEDGER, GOALS, { asOf: '2026-03' }).funds.find(
      (fund) => fund.name === 'Dana Menikah',
    )
    // Twelve months from March 2026 to March 2027, Rp44 juta to go.
    expect(wedding?.monthsLeft).toBe(12)
    expect(wedding?.neededPerMonth).toBe(idr('3.666.666,67'))
    // Rp2 juta a month does not make it.
    expect(wedding?.onTrack).toBe(false)
  })

  it('has no opinion about a pot with no deadline', () => {
    const house = reviewFunds(LEDGER, GOALS).funds.find((fund) => fund.name === 'Dana Rumah')
    expect(house?.monthsLeft).toBeNull()
    expect(house?.neededPerMonth).toBeNull()
    expect(house?.onTrack).toBeNull()
  })

  it('has no opinion about a pot with no target', () => {
    const savings = reviewFunds(LEDGER, GOALS).funds.find((fund) => fund.name === 'Tabungan')
    expect(savings?.remaining).toBeNull()
    expect(savings?.share).toBeNull()
    expect(savings?.saved).toBe(idr('500.000,00'))
  })

  it('cannot promise an arrival for a pot nobody feeds', () => {
    const idle = reviewFunds([], GOALS).funds.find((fund) => fund.name === 'Dana Menikah')
    expect(idle?.monthlyRate).toBe(0n)
    expect(idle?.monthsAtThisRate).toBeNull()
    expect(idle?.lastFed).toBeNull()
  })

  it('puts the deadlines that will be missed at the top', () => {
    const review = reviewFunds(LEDGER, GOALS, { asOf: '2026-03' })
    expect(review.funds[0].name).toBe('Dana Menikah')
    // A pot with no target cannot be behind, and putting it above a goal that
    // is short would bury the one line that needs a decision.
    expect(review.funds[review.funds.length - 1].name).toBe('Tabungan')
    expect(review.behind.map((fund) => fund.name)).toEqual(['Dana Menikah'])
  })

  it('totals only what can be totalled', () => {
    const review = reviewFunds(LEDGER, GOALS)
    expect(review.totalSaved).toBe(
      idr('6.000.000,00') + idr('14.000.000,00') + idr('500.000,00'),
    )
    // Tabungan has no target, so it contributes nothing to the target total.
    expect(review.totalTarget).toBe(idr('250.000.000,00'))
  })

  it('keeps one pot out of another pot of the same name', () => {
    const review = reviewFunds(
      [row('2026-01', 'Tabungan', idr('900.000,00'), 'financial_goal')],
      [
        { name: 'Tabungan', cashflow: 'invest_savings', openingBalance: 0n, target: null, targetMonth: null },
      ],
    )
    // A goal called Tabungan is not the savings pot called Tabungan. The
    // categories table allows the same name under two cashflow types, and this
    // is what that permission costs if the matching forgets about it.
    expect(review.funds[0].saved).toBe(0n)
  })
})

describe('monthsBetween', () => {
  it('counts whole months across a year boundary', () => {
    expect(monthsBetween('2026-03', '2027-03')).toBe(12)
    expect(monthsBetween('2026-11', '2027-02')).toBe(3)
  })

  it('gives a deadline already past no months at all', () => {
    expect(monthsBetween('2026-06', '2026-03')).toBe(0)
    expect(monthsBetween('2026-06', '2026-06')).toBe(0)
  })
})

describe('addMonths', () => {
  it('walks forward and back across year boundaries', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-02', -3)).toBe('2025-11')
    expect(addMonths('2026-06', 0)).toBe('2026-06')
  })

  it('is the inverse of monthsBetween for a forward gap', () => {
    expect(monthsBetween('2026-03', addMonths('2026-03', 19))).toBe(19)
  })
})

describe('reviewFunds dengan setoran yang direncanakan', () => {
  const wedding: FundCategory = {
    name: 'Dana Menikah',
    cashflow: 'financial_goal',
    openingBalance: 0n,
    target: idr('50.000.000,00'),
    targetMonth: null,
  }

  it('says when a planned contribution arrives, without a deadline being set', () => {
    const review = reviewFunds(
      [row('2026-06', 'Dana Menikah', idr('2.000.000,00'), 'financial_goal')],
      [{ ...wedding, plannedMonthly: idr('4.000.000,00') }],
    )

    // Rp48 juta left at Rp4 juta a month is twelve months, counted from the
    // last month in the ledger rather than from whenever the page is opened.
    expect(review.funds[0].monthsAtPlannedRate).toBe(12)
    expect(review.funds[0].etaMonth).toBe('2027-06')
  })

  it('prices a share of income, and refuses to price it without one', () => {
    const asShare = [{ ...wedding, plannedShareBp: 1_000 }]
    const entries = [row('2026-06', 'Dana Menikah', idr('2.000.000,00'), 'financial_goal')]

    const withIncome = reviewFunds(entries, asShare, { income: idr('10.000.000,00') })
    expect(withIncome.funds[0].plannedMonthly).toBe(idr('1.000.000,00'))

    // Ten percent of an income nobody knows is not zero, it is unknown.
    const without = reviewFunds(entries, asShare)
    expect(without.funds[0].plannedMonthly).toBeNull()
    expect(without.funds[0].etaMonth).toBeNull()
  })

  it('prefers the amount when a pot carries both an amount and a share', () => {
    const review = reviewFunds(
      [row('2026-06', 'Dana Menikah', idr('2.000.000,00'), 'financial_goal')],
      [{ ...wedding, plannedMonthly: idr('3.000.000,00'), plannedShareBp: 1_000 }],
      { income: idr('10.000.000,00') },
    )
    expect(review.funds[0].plannedMonthly).toBe(idr('3.000.000,00'))
  })

  it('judges the deadline by what was planned, not by what happened before it', () => {
    const entries = [row('2026-06', 'Dana Menikah', idr('1.000.000,00'), 'financial_goal')]
    const dated = { ...wedding, targetMonth: '2027-06' }

    // Rp49 juta over twelve months needs about Rp4,1 juta a month. The usual
    // rate of Rp1 juta does not make it; a household that has just decided to
    // put Rp5 juta in every month does.
    expect(reviewFunds(entries, [dated]).funds[0].onTrack).toBe(false)
    expect(
      reviewFunds(entries, [{ ...dated, plannedMonthly: idr('5.000.000,00') }]).funds[0].onTrack,
    ).toBe(true)
  })

  it('leaves a pot with no target without an arrival date', () => {
    const review = reviewFunds(
      [row('2026-06', 'Tabungan', idr('500.000,00'), 'invest_savings')],
      [
        {
          name: 'Tabungan',
          cashflow: 'invest_savings',
          openingBalance: 0n,
          target: null,
          targetMonth: null,
          plannedMonthly: idr('1.000.000,00'),
        },
      ],
    )
    expect(review.funds[0].monthsAtPlannedRate).toBeNull()
    expect(review.funds[0].etaMonth).toBeNull()
  })
})
