import { describe, expect, it } from 'vitest'
import { assessAdherence } from './adherence'
import { FRAMEWORKS } from './constants'
import type { FinancialSnapshot } from './ratios'

/** March 2026, near enough: Rp6,17jt in, Rp8,29jt of spending, nothing saved. */
const TIGHT: FinancialSnapshot = {
  monthlyIncome: 6_172_514_00n,
  monthlyDebtService: 0n,
  monthlySavings: 0n,
  monthlyExpenses: 8_287_460_00n,
  liquidAssets: 3_980_551_31n,
  totalAssets: 3_980_551_31n,
  totalDebt: 0n,
}

/** A household that is comfortably inside every bound. */
const HEALTHY: FinancialSnapshot = {
  monthlyIncome: 20_000_000_00n,
  monthlyDebtService: 2_000_000_00n,
  monthlySavings: 5_000_000_00n,
  monthlyExpenses: 11_000_000_00n,
  liquidAssets: 100_000_000_00n,
  totalAssets: 100_000_000_00n,
  totalDebt: 50_000_000_00n,
}

describe('assessAdherence', () => {
  it('folds buckets that draw on the same pot, and only those', () => {
    // 50/30/20 pays Kebutuhan out of spending and instalments together, so
    // Keinginan cannot be checked apart from it. Tabungan draws on nothing else
    // and stays its own line, which is the bucket that carries the OJK floor.
    const { groups } = assessAdherence(HEALTHY, '50-30-20')

    expect(groups).toHaveLength(2)
    expect(groups[0].labels).toEqual(['Kebutuhan', 'Keinginan'])
    expect(groups[0].combined).toBe(true)
    expect(groups[0].share).toBeCloseTo(0.8, 10)
    expect(groups[1].labels).toEqual(['Tabungan & investasi'])
    expect(groups[1].combined).toBe(false)
  })

  it('keeps instalments checkable on their own wherever the framework allows', () => {
    // The one bound OJK publishes as a hard ceiling. A framework that lets it be
    // read separately has to be read separately, or the panel loses the single
    // most actionable number it has.
    for (const id of ['40-30-20-10', 'ojk-10-20-30-40', 'qm-1234']) {
      const debt = assessAdherence(HEALTHY, id).groups.find((group) =>
        group.sources.includes('debt'),
      )
      expect(debt?.sources, id).toEqual(['debt'])
      expect(debt?.share, id).toBeCloseTo(0.3, 10)
      expect(debt?.bound, id).toBe('max')
    }
  })

  it('never counts a pot into two groups', () => {
    // The failure this whole grouping exists to prevent. Reporting Kebutuhan
    // and Keinginan separately would charge the spending pot to both and make
    // each of them look half as bad as it is.
    for (const framework of FRAMEWORKS) {
      const { groups } = assessAdherence(HEALTHY, framework.id)
      const seen = groups.flatMap((group) => group.sources)
      expect(new Set(seen).size, framework.id).toBe(seen.length)
    }
  })

  it('covers every bucket of every framework exactly once', () => {
    for (const framework of FRAMEWORKS) {
      const { groups } = assessAdherence(HEALTHY, framework.id)
      const keys = groups.flatMap((group) => group.keys)
      expect(keys.length, framework.id).toBe(framework.buckets.length)
      expect(
        groups.reduce((sum, group) => sum + group.share, 0),
        framework.id,
      ).toBeCloseTo(
        framework.buckets.reduce((sum, bucket) => sum + bucket.share, 0),
        10,
      )
    }
  })

  it('subtracts instalments from the spending pot rather than double counting', () => {
    // monthlyExpenses already contains debt service. Leaving it in would bill
    // this household for its cicilan twice.
    const spend = assessAdherence(HEALTHY, 'ojk-10-20-30-40').groups.find(
      (group) => group.sources.length === 1 && group.sources[0] === 'spend',
    )
    expect(spend?.actual).toBe(9_000_000_00n)
  })

  it('calls a floor missed by falling under it', () => {
    const savings = assessAdherence(TIGHT, '50-30-20').groups[1]
    expect(savings.bound).toBe('min')
    expect(savings.actual).toBe(0n)
    expect(savings.verdict).toBe('short')
    expect(savings.gap).toBe(1_234_502_80n)
  })

  it('calls a ceiling missed by going over it, and a target the same way', () => {
    // Spending less than a target for living costs is the household getting
    // ahead, not a plan being broken, so only the upper side raises anything.
    const living = assessAdherence(TIGHT, '50-30-20').groups[0]
    expect(living.bound).toBe('target')
    expect(living.verdict).toBe('over')
    expect(living.actual).toBe(8_287_460_00n)

    const generous = assessAdherence(HEALTHY, '50-30-20').groups[0]
    expect(generous.actual).toBeLessThan(generous.recommended)
    expect(generous.verdict).toBe('healthy')
    expect(generous.gap).toBe(0n)
  })

  it('ranks what is failing by the money that has to move', () => {
    // Not by how far off the percentage is. A ten point miss on a small bucket
    // is not the thing to fix first when a two point miss is worth ten times
    // as much in rupiah.
    const { failing } = assessAdherence(TIGHT, '50-30-20')
    expect(failing).toHaveLength(2)
    for (let i = 1; i < failing.length; i += 1) {
      expect(failing[i - 1].gap).toBeGreaterThanOrEqual(failing[i].gap)
    }
  })

  it('reports income that no pot ever claimed', () => {
    const { unassigned } = assessAdherence(HEALTHY, '50-30-20')
    expect(unassigned).toBe(4_000_000_00n)
  })

  it('reports a month that outspent its income as a negative remainder', () => {
    // Which is what March was. It has to read as overspent rather than quietly
    // clamp to zero, because the difference came out of a balance that is now
    // smaller.
    expect(assessAdherence(TIGHT, '50-30-20').unassigned).toBe(-2_114_946_00n)
  })

  it('leaves the shares unreadable rather than dividing by no income', () => {
    const nothing: FinancialSnapshot = { ...TIGHT, monthlyIncome: 0n }
    for (const group of assessAdherence(nothing, '50-30-20').groups) {
      expect(group.actualShare).toBeNull()
      expect(group.recommended).toBe(0n)
    }
  })

  it('falls back to a target where a group holds both a floor and a ceiling', () => {
    // QM publishes bounds rather than a partition, so its lifestyle ceiling and
    // its routine target land in one group with no single bound to state.
    const mixed = assessAdherence(HEALTHY, 'qm-1234').groups.find(
      (group) => group.keys.includes('lifestyle') && group.keys.includes('routine'),
    )
    expect(mixed?.bound).toBe('target')
    expect(mixed?.share).toBeCloseTo(0.7, 10)
  })

  it('refuses a framework it does not know', () => {
    expect(() => assessAdherence(HEALTHY, 'nonesuch')).toThrow(/framework/i)
  })
})
