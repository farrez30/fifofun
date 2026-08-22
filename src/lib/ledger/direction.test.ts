import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_KIND_LABELS,
  DIRECTION_LABELS,
  directionOf,
  ruleAgreesWithDirection,
  signedDirection,
  toneOf,
} from './direction'
import { ACCOUNT_KINDS, CASHFLOW_TYPES } from './types'

describe('directionOf', () => {
  it('covers every cashflow type', () => {
    for (const cashflow of CASHFLOW_TYPES) {
      expect(['in', 'out', 'neither']).toContain(directionOf(cashflow))
    }
  })

  it('treats receivable_settled as money in, which the dashboard used to get wrong', () => {
    expect(directionOf('receivable_settled')).toBe('in')
    expect(directionOf('receivable_new')).toBe('out')
  })

  it('keeps a transfer out of both directions', () => {
    expect(directionOf('transfer')).toBe('neither')
  })
})

describe('signedDirection', () => {
  it('maps neither to neutral for SignedMoney', () => {
    expect(signedDirection('transfer')).toBe('neutral')
    expect(signedDirection('income')).toBe('in')
    expect(signedDirection('spending')).toBe('out')
  })
})

describe('toneOf', () => {
  it('gives saving cashflows the save tone and debt the warn tone', () => {
    expect(toneOf('invest_savings')).toBe('save')
    expect(toneOf('sinking_fund')).toBe('save')
    expect(toneOf('financial_goal')).toBe('save')
    expect(toneOf('debt_payment')).toBe('warn')
    expect(toneOf('income')).toBe('income')
    expect(toneOf('bills')).toBe('spend')
  })

  it('covers every cashflow type', () => {
    for (const cashflow of CASHFLOW_TYPES) {
      expect(['income', 'spend', 'save', 'warn', 'neutral']).toContain(toneOf(cashflow))
    }
  })
})

describe('ruleAgreesWithDirection', () => {
  it('lets a rule without a cashflow opinion apply to any row', () => {
    expect(ruleAgreesWithDirection(null, 'income')).toBe(true)
    expect(ruleAgreesWithDirection(null, 'spending')).toBe(true)
  })

  it('refuses a spending rule on an incoming row', () => {
    expect(ruleAgreesWithDirection('spending', 'income')).toBe(false)
    expect(ruleAgreesWithDirection('spending', 'bills')).toBe(true)
    expect(ruleAgreesWithDirection('income', 'receivable_settled')).toBe(true)
  })
})

describe('labels', () => {
  it('names every direction and every account kind in Indonesian', () => {
    expect(Object.keys(DIRECTION_LABELS).sort()).toEqual(['in', 'neither', 'out'])
    for (const kind of ACCOUNT_KINDS) expect(ACCOUNT_KIND_LABELS[kind]).toBeTruthy()
  })
})
