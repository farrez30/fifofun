import { describe, expect, it } from 'vitest'
import { findStaleAdjustments, type AdjustmentRow, type MovementRow } from './adjustments'
import { adjustmentNote } from './manual'

/**
 * The GoPay case from 1 Oct 2026, in sen: the wallet was counted on 23 Aug and
 * found empty while the ledger read Rp6.134.481, so a Rp6.134.481 spending
 * correction was booked at 23:59 that day. A month later the August statement
 * added two top-ups and a withdrawal dated before it, and the wallet closed at
 * minus Rp6.460.
 */

const GOPAY = 'gopay'
const BANK = 'bank'
const COUNTED = new Date('2026-08-23T16:59:00Z')
const WRITTEN = new Date('2026-08-22T18:12:00Z')

let counter = 0
function topUp(amount: bigint, at: string, to = GOPAY, from: string | null = BANK): MovementRow {
  counter += 1
  return { id: `m${counter}`, occurredAt: new Date(at), amount, fromAccountId: from, toAccountId: to }
}

function correction(overrides: Partial<AdjustmentRow> & { recorded: bigint; actual: bigint }): AdjustmentRow {
  counter += 1
  const { recorded, actual, ...rest } = overrides
  const delta = actual - recorded
  return {
    id: `a${counter}`,
    accountId: GOPAY,
    occurredAt: COUNTED,
    createdAt: WRITTEN,
    amount: delta < 0n ? -delta : delta,
    cashflow: delta < 0n ? 'spending' : 'income',
    note: adjustmentNote('GoPay', recorded, actual),
    ...rest,
  }
}

function asMovement(row: AdjustmentRow): MovementRow {
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    amount: row.amount,
    fromAccountId: row.cashflow === 'spending' ? row.accountId : null,
    toAccountId: row.cashflow === 'income' ? row.accountId : null,
  }
}

const OPENING = new Map([[GOPAY, 0n]])

describe('findStaleAdjustments', () => {
  const before = [topUp(613_448_100n, '2026-07-01T00:00:00Z')]
  const counted = correction({ recorded: 613_448_100n, actual: 0n })

  it('leaves a correction alone while the balance under it has not moved', () => {
    expect(findStaleAdjustments([...before, asMovement(counted)], [counted], OPENING)).toEqual([])
  })

  it('catches rows that arrived later with earlier dates, and says what the row should be', () => {
    const august = [
      topUp(6_000_000n, '2026-08-02T11:40:00Z'),
      topUp(3_354_000n, '2026-08-19T05:57:00Z'),
      topUp(10_000_000n, '2026-08-23T02:39:00Z', BANK, GOPAY),
    ]
    const [stale] = findStaleAdjustments([...before, ...august, asMovement(counted)], [counted], OPENING)
    expect(stale).toMatchObject({ id: counted.id, actual: 0n, landsAt: -646_000n })
    expect(stale.amount).toBe(612_802_100n)
    expect(stale.cashflow).toBe('spending')
  })

  it('ignores rows after the correction, which the count could not have seen', () => {
    const later = topUp(10_000_000n, '2026-09-01T00:00:00Z')
    expect(findStaleAdjustments([...before, asMovement(counted), later], [counted], OPENING)).toEqual([])
  })

  it('flips the direction when the wallet now holds less than it really did', () => {
    const small = correction({ recorded: 613_448_100n, actual: 600_000_000n })
    const [stale] = findStaleAdjustments(
      [topUp(500_000_000n, '2026-07-01T00:00:00Z'), asMovement(small)],
      [small],
      OPENING,
    )
    expect(stale).toMatchObject({ cashflow: 'income', amount: 100_000_000n })
  })

  it('counts the opening balance', () => {
    const fromOpening = correction({ recorded: 613_448_100n, actual: 0n })
    const stale = findStaleAdjustments(
      [asMovement(fromOpening)],
      [fromOpening],
      new Map([[GOPAY, 613_448_100n]]),
    )
    expect(stale).toEqual([])
  })

  it('takes earlier corrections on the same account as right when judging a later one', () => {
    // ShopeePay was corrected three times in two minutes, all booked at 23:59.
    const first = correction({ recorded: 674_133_100n, actual: 238_800n })
    const second = correction({ recorded: 238_800n, actual: 89_900n, createdAt: new Date(WRITTEN.getTime() + 60_000) })
    const third = correction({ recorded: 89_900n, actual: 238_800n, createdAt: new Date(WRITTEN.getTime() + 120_000) })
    const rows = [topUp(674_133_100n, '2026-07-01T00:00:00Z'), ...[first, second, third].map(asMovement)]
    expect(findStaleAdjustments(rows, [third, first, second], OPENING)).toEqual([])

    // A late top-up only moves the first; the later two still chain from its claim.
    const late = topUp(5_000_000n, '2026-08-10T00:00:00Z')
    const stale = findStaleAdjustments([...rows, late], [first, second, third], OPENING)
    expect(stale.map((row) => row.id)).toEqual([first.id])
  })

  it('reads an old note to the rupiah, so its rounding is not called stale', () => {
    // Tokocrypto: really Rp5.119,16, written in the note as Rp5.119.
    const crypto = {
      ...correction({ recorded: 17_000_000n, actual: 511_916n }),
      note: 'Penyesuaian saldo Tokocrypto: tercatat Rp170.000, sebenarnya Rp5.119.',
    }
    const rows = [topUp(17_000_000n, '2026-07-01T00:00:00Z'), asMovement(crypto)]
    expect(findStaleAdjustments(rows, [crypto], OPENING)).toEqual([])
  })

  it('leaves a correction whose note was edited past reading', () => {
    const edited = { ...counted, note: 'dihitung manual' }
    const rows = [...before, topUp(9_000_000n, '2026-08-02T00:00:00Z'), asMovement(edited)]
    expect(findStaleAdjustments(rows, [edited], OPENING)).toEqual([])
  })

  it('says a correction is no longer needed when the balance already lands on the claim', () => {
    const rows = [topUp(613_448_100n, '2026-07-01T00:00:00Z'), topUp(613_448_100n, '2026-08-01T00:00:00Z', BANK, GOPAY)]
    const [stale] = findStaleAdjustments([...rows, asMovement(counted)], [counted], OPENING)
    expect(stale.amount).toBe(0n)
  })
})
