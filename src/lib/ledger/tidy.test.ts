import { describe, expect, it } from 'vitest'
import type { Rule } from './rules'
import {
  HOLD,
  PARKING_CATEGORIES,
  moveKey,
  planTidy,
  resolveTidy,
  type TidyRow,
  type TidyTarget,
} from './tidy'
import type { CashflowType } from './types'

/**
 * Tidying rewrites rows a person may have been looking at for a year, and
 * there is no undo. Everything worth asserting here is a refusal.
 */

const TARGETS: TidyTarget[] = [
  { id: 'bensin', name: 'Bensin', cashflow: 'spending' },
  { id: 'listrik', name: 'Listrik', cashflow: 'bills' },
  { id: 'gaji', name: 'Gaji', cashflow: 'income' },
]

function rule(pattern: string, categoryId: string, cashflow: CashflowType, priority = 20): Rule {
  return {
    id: `rule-${pattern}`,
    priority,
    matchType: 'contains',
    pattern,
    cashflow,
    categoryId,
    autoApply: true,
    hitCount: 0,
  }
}

let seq = 0
function row(
  description: string,
  categoryName: string | null,
  cashflow: CashflowType = 'spending',
  amount = 100_000_00n,
  occurredAt = new Date('2026-05-01T03:00:00Z'),
): TidyRow {
  seq++
  return {
    id: `row-${seq}`,
    description,
    rawDescription: description,
    amount,
    cashflow,
    categoryName,
    occurredAt,
    categoryLockedAt: null,
  }
}

describe('planTidy', () => {
  it('moves a row out of a category the importer only parked it in', () => {
    const plan = planTidy(
      [row('SPBU 31.11802 Kalideres', 'Makan/minum')],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )

    expect(plan.count).toBe(1)
    expect(plan.moves).toHaveLength(1)
    expect(plan.moves[0]).toMatchObject({ from: 'Makan/minum', to: 'Bensin', count: 1 })
    expect(plan.protectedCount).toBe(0)
  })

  it('leaves a category somebody chose exactly where it is', () => {
    // The same row, already filed under something nobody defaults to. A rule
    // matching it is not a reason to overrule the person who filed it.
    const plan = planTidy(
      [row('SPBU 31.11802 Kalideres', 'Kendaraan')],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )

    expect(plan.count).toBe(0)
    expect(plan.protectedCount).toBe(1)
  })

  it('counts an uncategorised row as fair game', () => {
    const plan = planTidy(
      [row('SPBU 31.11802', null)],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )
    expect(plan.count).toBe(1)
    expect(plan.moves[0].from).toBe('(tanpa kategori)')
  })

  it('refuses to write a spending category onto money coming in', () => {
    /*
      A rule taught on a payment to somebody matches the refund they send back.
      Writing the outgoing category onto the incoming row is the shape the
      account-sides check refuses, and one such row fails the whole batch.
    */
    const plan = planTidy(
      [row('SPBU refund', 'Penyesuaian Income', 'income')],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )
    expect(plan.count).toBe(0)
  })

  it('promises nothing for a row already where the rule wants it', () => {
    const plan = planTidy(
      [row('SPBU 31.11802', 'Bensin')],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )
    expect(plan.count).toBe(0)
    // Bensin is not a parking category, so the row is protected as well as
    // already correct; either way nothing is promised.
    expect(plan.moves).toEqual([])
  })

  it('follows priority when two rules match, the way the importer does', () => {
    const plan = planTidy(
      [row('Aeropolis Token Listrik', 'Makan/minum', 'bills')],
      [rule('listrik', 'listrik', 'bills', 20), rule('aeropolis', 'bensin', 'spending', 30)],
      TARGETS,
    )
    expect(plan.moves[0]).toMatchObject({ to: 'Listrik' })
  })

  it('groups by the pot moved out of and the pot moved into', () => {
    const plan = planTidy(
      [
        row('SPBU A', 'Makan/minum', 'spending', 50_000_00n),
        row('SPBU B', 'Makan/minum', 'spending', 30_000_00n),
        row('SPBU C', 'Belanja', 'spending', 20_000_00n),
      ],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )

    expect(plan.count).toBe(3)
    expect(plan.moves).toHaveLength(2)
    // Largest first, so the row a person reads before agreeing is the one that
    // moves the most money.
    expect(plan.moves[0]).toMatchObject({ from: 'Makan/minum', count: 2, amount: 80_000_00n })
    expect(plan.moves[1]).toMatchObject({ from: 'Belanja', count: 1 })
    expect(plan.amount).toBe(100_000_00n)
  })

  it('ignores a rule pointing at a category that no longer exists', () => {
    const plan = planTidy(
      [row('SPBU A', 'Makan/minum')],
      [rule('spbu', 'deleted-category', 'spending')],
      TARGETS,
    )
    expect(plan.count).toBe(0)
  })

  it('never lists a parking category that is also a group', () => {
    // Every name on the list has to be somewhere a row can actually sit.
    expect(PARKING_CATEGORIES).toContain('Other spending')
    expect(PARKING_CATEGORIES).not.toContain('Belanja Harian')
  })
})

describe('planTidy, what a person has to read before agreeing', () => {
  it('carries the transactions that make up a move, newest first', () => {
    const plan = planTidy(
      [
        row('SPBU lama', 'Makan/minum', 'spending', 50_000_00n, new Date('2026-01-05T03:00:00Z')),
        row('SPBU baru', 'Makan/minum', 'spending', 60_000_00n, new Date('2026-08-05T03:00:00Z')),
      ],
      [rule('spbu', 'bensin', 'spending')],
      TARGETS,
    )

    expect(plan.moves[0].entries.map((entry) => entry.description)).toEqual([
      'SPBU baru',
      'SPBU lama',
    ])
  })

  it('names the rule that claimed each row, which is the only "why" there is', () => {
    const plan = planTidy(
      [row('Aeropolis Token Listrik', 'Belanja', 'bills')],
      [rule('token listrik', 'listrik', 'bills')],
      TARGETS,
    )
    expect(plan.moves[0].entries[0].pattern).toBe('token listrik')
  })

  it('stops offering a row somebody has already said no to', () => {
    const held = row('SPBU 31.11802', 'Other spending')
    held.categoryLockedAt = new Date('2026-08-01T03:00:00Z')

    const plan = planTidy([held], [rule('spbu', 'bensin', 'spending')], TARGETS)

    expect(plan.count).toBe(0)
    expect(plan.heldCount).toBe(1)
    // Told apart from the other refusal on purpose: that one is "you picked
    // this category", this one is "you told me to stop asking".
    expect(plan.protectedCount).toBe(0)
  })
})

describe('resolveTidy', () => {
  const GROUPS = new Set<string>()
  const rules = [rule('spbu', 'bensin', 'spending')]

  function planOf(rows: TidyRow[]) {
    return planTidy(rows, rules, TARGETS)
  }

  it('writes the plan as it stands when nobody changed anything', () => {
    const plan = planOf([row('SPBU A', 'Makan/minum'), row('SPBU B', 'Makan/minum')])
    const resolved = resolveTidy(plan, new Map(), TARGETS, GROUPS, null)

    expect(resolved.writes).toHaveLength(1)
    expect(resolved.writes[0]).toMatchObject({ categoryId: 'bensin', cashflow: 'spending' })
    expect(resolved.count).toBe(2)
    expect(resolved.held).toEqual([])
  })

  it('sends a redirected row to the pot the person picked instead', () => {
    const first = row('SPBU A', 'Makan/minum')
    const plan = planOf([first, row('SPBU B', 'Makan/minum')])

    const resolved = resolveTidy(
      plan,
      new Map([[first.id, 'listrik']]),
      TARGETS,
      GROUPS,
      null,
    )

    expect(resolved.writes).toHaveLength(2)
    expect(resolved.writes.find((write) => write.categoryId === 'listrik')?.ids).toEqual([first.id])
    expect(resolved.count).toBe(2)
  })

  it('takes a held row out of every write rather than filing it somewhere', () => {
    const first = row('SPBU A', 'Makan/minum')
    const plan = planOf([first, row('SPBU B', 'Makan/minum')])

    const resolved = resolveTidy(plan, new Map([[first.id, HOLD]]), TARGETS, GROUPS, null)

    expect(resolved.held).toEqual([first.id])
    expect(resolved.writes.flatMap((write) => write.ids)).not.toContain(first.id)
    expect(resolved.count).toBe(1)
  })

  it('refuses a row the plan does not contain', () => {
    // Narrowing is always allowed, widening never is: an id from outside the
    // plan is a row tidying has no business touching, whether it was settled in
    // another tab or made up in a request.
    const plan = planOf([row('SPBU A', 'Makan/minum')])
    const resolved = resolveTidy(
      plan,
      new Map([['row-tidak-ada', 'bensin']]),
      TARGETS,
      GROUPS,
      null,
    )

    expect(resolved.rejected).toHaveLength(1)
    expect(resolved.rejected[0].reason).toContain('Muat ulang')
  })

  it('refuses a pot facing the other way, with the sentence saying which way', () => {
    const first = row('SPBU A', 'Makan/minum')
    const plan = planOf([first])
    const resolved = resolveTidy(plan, new Map([[first.id, 'gaji']]), TARGETS, GROUPS, null)

    expect(resolved.count).toBe(0)
    expect(resolved.rejected[0].reason).toContain('uang masuk')
  })

  it('refuses a group, because a group holding a row double counts it', () => {
    const first = row('SPBU A', 'Makan/minum')
    const plan = planOf([first])
    const resolved = resolveTidy(
      plan,
      new Map([[first.id, 'bensin']]),
      TARGETS,
      new Set(['bensin']),
      null,
    )

    expect(resolved.count).toBe(0)
    expect(resolved.rejected[0].reason).toContain('kelompok')
  })

  it('leaves every other move alone when one move is run', () => {
    const plan = planTidy(
      [row('SPBU A', 'Makan/minum'), row('SPBU B', 'Belanja')],
      rules,
      TARGETS,
    )
    const resolved = resolveTidy(
      plan,
      new Map(),
      TARGETS,
      GROUPS,
      moveKey('Belanja', 'bensin'),
    )

    expect(resolved.count).toBe(1)
    expect(resolved.writes[0].ids).toHaveLength(1)
  })

  it('keys a move so a category name cannot be read as another move', () => {
    // The name half is whatever somebody typed. Joined raw, a name containing
    // the separator would produce the key of a different move, and the wrong
    // rows would be written.
    expect(moveKey('Makan|minum', 'bensin')).not.toBe(moveKey('Makan', 'minum|bensin'))
  })
})
