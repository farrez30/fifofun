import type { CashflowType } from './types'

/**
 * Learned categorisation rules.
 *
 * The bank classifier in `lib/statement/classify` decides what a row *is* at
 * bank level: a QRIS payment, a top-up, a salary. It deliberately stops before
 * deciding whether a QRIS payment at a coffee shop is Makan/minum or Jajan,
 * because that is a household preference and no amount of pattern matching over
 * bank strings can know it.
 *
 * This module is where the household's answer lives. Every rule was created by a
 * person correcting one transaction and choosing to make the correction stick,
 * so a rule is a recorded decision rather than a guess.
 *
 * There is deliberately no regular expression match type. Patterns arrive from a
 * form and are run against every row in the ledger; a user-supplied regular
 * expression is a denial-of-service waiting to happen, and nothing here needs
 * more than the three literal matches below.
 */

export type MatchType = 'contains' | 'prefix' | 'exact'

export const MATCH_LABELS: Record<MatchType, string> = {
  contains: 'mengandung',
  prefix: 'diawali',
  exact: 'sama persis',
}

export interface Rule {
  id: string
  /** Lower runs first, so a specific rule can pre-empt a general one. */
  priority: number
  matchType: MatchType
  pattern: string
  cashflow: CashflowType | null
  categoryId: string | null
  categoryName?: string | null
  /** Apply on sight, or only propose and leave the row flagged. */
  autoApply: boolean
  hitCount: number
}

/** The fields a rule can decide. Null means the rule has no opinion. */
export interface RuleOutcome {
  cashflow: CashflowType | null
  categoryId: string | null
}

/**
 * Enough of a row to run a rule against it.
 *
 * Deliberately without an id. Matching an unsaved row, which is what an import
 * does before it writes anything, is the same operation as matching a saved
 * one, and requiring a primary key would have meant either inventing one or
 * writing the matcher twice.
 */
export interface Describable {
  /**
   * The bank's untouched text. Matching happens here rather than on the tidied
   * description, because the tidied one is derived and can change when the
   * classifier changes, which would silently unmatch rules written months ago.
   */
  rawDescription?: string | null
  description: string
}

/** A row that has been saved, so a rule's verdict can be recorded against it. */
export interface Matchable extends Describable {
  id: string
}

/** Folded to lower case and with runs of whitespace collapsed. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function subject(entry: Describable): string {
  return normalise(entry.rawDescription || entry.description)
}

export function matches(rule: Rule, entry: Describable): boolean {
  const pattern = normalise(rule.pattern)
  if (pattern === '') return false

  const text = subject(entry)
  if (rule.matchType === 'exact') return text === pattern
  if (rule.matchType === 'prefix') return text.startsWith(pattern)
  return text.includes(pattern)
}

/**
 * The first rule that matches wins, in priority order.
 *
 * First match rather than most specific, because "most specific" has no honest
 * definition here: a longer pattern is not always the more specific one. Making
 * priority explicit means a surprising result is something the household can see
 * and reorder, not something the engine decided on its own.
 */
export function firstMatch(rules: Rule[], entry: Describable): Rule | null {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
  return ordered.find((rule) => matches(rule, entry)) ?? null
}

export interface Assignment {
  entryId: string
  rule: Rule
  outcome: RuleOutcome
}

/** Every entry a rule has an opinion about, paired with that opinion. */
export function applyRules(rules: Rule[], entries: Matchable[]): Assignment[] {
  const assignments: Assignment[] = []

  for (const entry of entries) {
    const rule = firstMatch(rules, entry)
    if (!rule) continue
    if (rule.cashflow === null && rule.categoryId === null) continue
    assignments.push({
      entryId: entry.id,
      rule,
      outcome: { cashflow: rule.cashflow, categoryId: rule.categoryId },
    })
  }

  return assignments
}

/** Trailing digits: reference numbers, virtual accounts, card sequence numbers. */
const TRAILING_REFERENCE = /[\s-]*\b\d[\d\s-]{5,}$/

export interface Suggestion {
  matchType: MatchType
  pattern: string
}

/**
 * Proposes the pattern to offer when somebody corrects a transaction.
 *
 * It reads the tidied description, not the bank's raw text, and that is the
 * whole design. The bank writes a counterparty five different ways depending on
 * the channel: on line two after "ke", on line three after a bank name, or on
 * line two with the account number glued behind it and the payer's own note
 * underneath. `lib/statement/classify` already untangles all of that and is
 * tested against the full corpus for exactly that job. Re-deriving it here from
 * the raw lines was a second, worse implementation of the same thing, and it
 * produced 156 different patterns for 220 rows because every payment note ended
 * up inside the pattern.
 *
 * Matching still runs against the raw text, which is stable. A pattern taken
 * from the tidied description is a substring of the raw text, so the two agree.
 *
 * The result is a starting point in an editable field, never applied on its own.
 */
export function suggestPattern(entry: Matchable): Suggestion | null {
  // The counterparty and the payer's own note are joined by a dash. The note
  // belongs to one payment and must never enter a rule.
  const text = normalise(entry.description.split(' - ')[0])
    .replace(TRAILING_REFERENCE, '')
    .trim()

  if (text.length < 3) return null
  return { matchType: 'contains', pattern: text }
}

export interface Groupable extends Matchable {
  amount: bigint
  categoryName?: string | null
}

export interface ReviewGroup {
  pattern: string
  matchType: MatchType
  entries: Groupable[]
  count: number
  total: bigint
  /** A few real descriptions, so the pattern can be sanity checked before use. */
  samples: string[]
  /** Categories the rows currently carry, so a mixed group is visible as mixed. */
  currentCategories: string[]
}

/**
 * Groups the review queue by the pattern a rule would use.
 *
 * Reviewing one transaction at a time is the obvious design and the wrong one.
 * In this household's ledger, 220 uncategorised rows collapse into 25 patterns,
 * and 13 of those cover 208 of the rows. A per-transaction queue asks for 220
 * decisions to reach the same place 13 decisions reach.
 *
 * Ranked by money rather than by count, because the point of categorising is to
 * find out where the money went, and eighty small payments matter less than four
 * large ones.
 */
export function groupBySuggestion(entries: Groupable[], rules: Rule[] = []): ReviewGroup[] {
  const groups = new Map<string, ReviewGroup>()

  for (const entry of entries) {
    // Anything a rule already decides is not waiting on a person.
    if (firstMatch(rules, entry)) continue

    const suggestion = suggestPattern(entry)
    if (!suggestion) continue

    const existing = groups.get(suggestion.pattern)
    if (existing) {
      existing.entries.push(entry)
      existing.count += 1
      existing.total += entry.amount
      if (existing.samples.length < 3) existing.samples.push(entry.description)
      if (entry.categoryName && !existing.currentCategories.includes(entry.categoryName)) {
        existing.currentCategories.push(entry.categoryName)
      }
      continue
    }

    groups.set(suggestion.pattern, {
      pattern: suggestion.pattern,
      matchType: suggestion.matchType,
      entries: [entry],
      count: 1,
      total: entry.amount,
      samples: [entry.description],
      currentCategories: entry.categoryName ? [entry.categoryName] : [],
    })
  }

  return [...groups.values()].sort(
    (a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0) || a.pattern.localeCompare(b.pattern, 'id'),
  )
}

export interface RuleConflict {
  kind: 'duplicate' | 'shadowed'
  existing: Rule
}

/**
 * Whether a proposed rule is already covered by one that runs earlier.
 *
 * Adding a rule that can never fire is the quiet failure of a system like this:
 * the household believes it has taught the app something, the app keeps
 * categorising the way it did, and nothing explains why.
 */
export function findConflict(rules: Rule[], proposed: Omit<Rule, 'id' | 'hitCount'>): RuleConflict | null {
  const pattern = normalise(proposed.pattern)

  for (const rule of [...rules].sort((a, b) => a.priority - b.priority)) {
    if (normalise(rule.pattern) === pattern && rule.matchType === proposed.matchType) {
      return { kind: 'duplicate', existing: rule }
    }
    // An earlier, broader rule swallows everything the new one would have caught.
    if (
      rule.priority <= proposed.priority &&
      rule.matchType === 'contains' &&
      pattern.includes(normalise(rule.pattern))
    ) {
      return { kind: 'shadowed', existing: rule }
    }
  }

  return null
}
