import { ACCOUNT_RULES, type CashflowType } from './types'

/**
 * Manual entries that turn out to be the same movement the bank later
 * reported.
 *
 * Somebody types a cash payment on the day it happens; a month later the
 * statement arrives with the same payment in it, because it went through the
 * account after all. Neither row is wrong, and counting both is. Nothing here
 * decides anything: it pairs what looks like the same movement and leaves the
 * decision to a person, the same way the email reconciliation does.
 *
 * The matching is that module's design, generalised. Exact amount, same
 * account, nearest in time wins, one pairing per row. Two departures: the
 * window is days rather than minutes, because a person types a date and not a
 * timestamp, and there is no reference to match on, because a person does not
 * have one.
 */

export interface Pairable {
  id: string
  occurredAt: Date
  amount: bigint
  fromAccountId: string | null
  toAccountId: string | null
}

export interface DuplicateCandidate<M extends Pairable, I extends Pairable> {
  manual: M
  imported: I
  /** Seconds between the two timestamps. */
  driftSeconds: number
}

export interface ConflictOptions {
  toleranceDays?: number
}

export interface ConflictResult<M extends Pairable, I extends Pairable> {
  pairs: DuplicateCandidate<M, I>[]
  /** Manual rows the statement has nothing like. */
  unmatchedManual: M[]
}

const DEFAULT_TOLERANCE_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

/** Two rows touch the same account when either side matches on the same side. */
function sharesAccount(a: Pairable, b: Pairable): boolean {
  if (a.fromAccountId !== null && a.fromAccountId === b.fromAccountId) return true
  return a.toAccountId !== null && a.toAccountId === b.toAccountId
}

export function findLikelyDuplicates<M extends Pairable, I extends Pairable>(
  manual: M[],
  imported: I[],
  options: ConflictOptions = {},
): ConflictResult<M, I> {
  const tolerance = (options.toleranceDays ?? DEFAULT_TOLERANCE_DAYS) * DAY_MS

  const candidates: DuplicateCandidate<M, I>[] = []
  for (const left of manual) {
    for (const right of imported) {
      // The amount has to be exact. Only the timing is allowed to be fuzzy,
      // because only the timing has a legitimate reason to differ.
      if (left.amount !== right.amount) continue
      if (!sharesAccount(left, right)) continue
      const drift = Math.abs(left.occurredAt.getTime() - right.occurredAt.getTime())
      if (drift > tolerance) continue
      candidates.push({ manual: left, imported: right, driftSeconds: Math.round(drift / 1000) })
    }
  }

  /*
    Nearest first, across the whole set, before anything is claimed. Walking
    the manual rows in order and taking the first match each time would let a
    row three days away claim a bank row that another manual entry made on the
    same day was entitled to.
  */
  candidates.sort(
    (a, b) =>
      a.driftSeconds - b.driftSeconds ||
      a.manual.id.localeCompare(b.manual.id) ||
      a.imported.id.localeCompare(b.imported.id),
  )

  const takenManual = new Set<string>()
  const takenImported = new Set<string>()
  const pairs: DuplicateCandidate<M, I>[] = []

  for (const candidate of candidates) {
    if (takenManual.has(candidate.manual.id) || takenImported.has(candidate.imported.id)) continue
    pairs.push(candidate)
    takenManual.add(candidate.manual.id)
    takenImported.add(candidate.imported.id)
  }

  return {
    pairs,
    unmatchedManual: manual.filter((row) => !takenManual.has(row.id)),
  }
}

export interface MergeSide {
  cashflow: CashflowType
  categoryId: string | null
  note: string | null
  confirmedAt: Date | null
}

export interface MergePatch {
  category_id?: string
  cashflow?: CashflowType
  note?: string
  confirmed_at?: string
  needs_review?: false
}

export interface MergeDecision {
  /** What to write on the bank row, or null when nothing moves. */
  importedPatch: MergePatch | null
  adopted: 'category-and-note' | 'note' | 'nothing'
}

/**
 * What survives when the two are merged.
 *
 * The bank row is kept, always: it is the one the statement can prove and the
 * one the running balance depends on. What the manual row carries that the
 * bank row does not is a person's own judgement, so the category and the note
 * move across and the manual row is hidden.
 *
 * The compatibility test is between the cashflow of the *category being
 * written* and the one the bank row already has, not between the two rows.
 * The stored account sides belong to the bank row, and only a category whose
 * cashflow uses the same sides can be written onto them.
 */
export function planMerge(
  manual: MergeSide,
  manualCategoryCashflow: CashflowType | null,
  imported: MergeSide,
  now: Date,
): MergeDecision {
  const target = manualCategoryCashflow
  const compatible =
    target !== null &&
    ACCOUNT_RULES[target].from === ACCOUNT_RULES[imported.cashflow].from &&
    ACCOUNT_RULES[target].to === ACCOUNT_RULES[imported.cashflow].to

  if (imported.confirmedAt === null && manual.categoryId && target && compatible) {
    return {
      importedPatch: {
        category_id: manual.categoryId,
        cashflow: target,
        note: manual.note ?? imported.note ?? undefined,
        confirmed_at: now.toISOString(),
        needs_review: false,
      },
      adopted: 'category-and-note',
    }
  }

  if (manual.note && !imported.note) {
    return { importedPatch: { note: manual.note }, adopted: 'note' }
  }

  return { importedPatch: null, adopted: 'nothing' }
}
