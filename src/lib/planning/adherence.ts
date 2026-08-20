import { type AllocationFramework, type BucketSource } from './constants'
import { applyShare, getFramework } from './allocation'
import type { FinancialSnapshot } from './ratios'

/**
 * The allocation framework, checked against what the household actually did.
 *
 * Until now the allocation panel only ever prescribed. It could say OJK puts
 * cicilan at thirty percent, and nothing on the page said whether this household
 * was at eight or at forty, which makes a well sourced number decorative.
 *
 * The comparison is built out of cashflow types rather than category names, and
 * that constraint is the whole design. A cashflow type is something the
 * household already assigned, so reading a pot off it restates their own filing
 * instead of guessing. Category names would let every bucket be checked
 * separately, but only by inventing a needs-against-wants taxonomy that no
 * published framework supplies, and printing an invented mapping beside figures
 * carrying OJK citations would launder a guess as a regulator's number.
 *
 * So buckets drawing on the same pot are reported together, and the panel says
 * why. "Kebutuhan dan Keinginan, digabung: 80% dianjurkan, kamu 92%" is a true
 * statement a household can act on. Splitting that 92% into two numbers would be
 * a more useful statement that happens to be fiction.
 */

export type AdherenceVerdict = 'healthy' | 'short' | 'over'

export interface AdherenceGroup {
  /** The framework's own labels for the buckets folded together here. */
  labels: string[]
  keys: string[]
  sources: BucketSource[]
  /** A floor, a ceiling, or a target. Mixed groups fall back to a target. */
  bound: 'min' | 'max' | 'target'
  /** Share of income the framework asks for, summed across the group. */
  share: number
  recommended: bigint
  actual: bigint
  /** Actual as a share of income, or null when nothing came in. */
  actualShare: number | null
  verdict: AdherenceVerdict
  /** What would have to move to satisfy the bound. Zero when it already does. */
  gap: bigint
  /** True when more than one bucket had to be folded in to stay honest. */
  combined: boolean
}

export interface Adherence {
  framework: AllocationFramework
  income: bigint
  groups: AdherenceGroup[]
  /**
   * Income no pot claimed. Positive is money that simply piled up without being
   * given a job; negative is a month that spent more than it earned and made up
   * the difference from savings or from what was already in the account.
   */
  unassigned: bigint
  /** The groups missing their bound, largest gap first. */
  failing: AdherenceGroup[]
}

/** What each pot is called where the panel has to name one on its own. */
export const POT_LABEL: Record<BucketSource, string> = {
  spend: 'pengeluaran dan tagihan',
  debt: 'cicilan',
  save: 'tabungan, sinking fund dan tujuan',
}

/**
 * Groups the sources that any single bucket draws on together.
 *
 * Two buckets sharing a pot cannot be checked apart, and the sharing is
 * transitive: 50/30/20 pays Kebutuhan out of spending and instalments together,
 * so Keinginan, which only touches spending, is dragged into the same group as
 * instalments. Reporting them separately would count the spending pot twice and
 * flatter every bucket in it.
 */
function connect(framework: AllocationFramework): (source: BucketSource) => BucketSource {
  const parent: Record<BucketSource, BucketSource> = {
    spend: 'spend',
    debt: 'debt',
    save: 'save',
  }
  const find = (source: BucketSource): BucketSource =>
    parent[source] === source ? source : (parent[source] = find(parent[source]))

  for (const bucket of framework.buckets) {
    const [first, ...rest] = bucket.sources
    for (const source of rest) {
      const a = find(first)
      const b = find(source)
      if (a !== b) parent[a] = b
    }
  }
  return find
}

export function assessAdherence(
  snapshot: FinancialSnapshot,
  frameworkId: string,
): Adherence {
  const framework = getFramework(frameworkId)
  const income = snapshot.monthlyIncome

  /*
    Instalments are subtracted rather than added, because `monthlyExpenses`
    already contains them. Leaving them in would charge this household for its
    cicilan twice and make the spending pot look worse than it is.
  */
  const pots: Record<BucketSource, bigint> = {
    spend: snapshot.monthlyExpenses - snapshot.monthlyDebtService,
    debt: snapshot.monthlyDebtService,
    save: snapshot.monthlySavings,
  }

  const find = connect(framework)
  const order: BucketSource[] = []
  const members = new Map<BucketSource, typeof framework.buckets>()

  for (const bucket of framework.buckets) {
    const root = find(bucket.sources[0])
    if (!members.has(root)) {
      members.set(root, [])
      order.push(root)
    }
    members.get(root)!.push(bucket)
  }

  const groups: AdherenceGroup[] = order.map((root) => {
    const buckets = members.get(root)!
    const sources = (['spend', 'debt', 'save'] as const).filter((source) => find(source) === root)
    const share = buckets.reduce((sum, bucket) => sum + bucket.share, 0)
    const actual = sources.reduce((sum, source) => sum + pots[source], 0n)
    const recommended = applyShare(income, share)

    /*
      A group holding both a floor and a ceiling has no single bound to state, so
      it is reported as a target. That only happens on the frameworks that
      publish bounds rather than a partition, and those say in their own caveat
      that the figures are a guide.
    */
    const bounds = new Set(buckets.map((bucket) => bucket.bound))
    const bound = bounds.size === 1 ? buckets[0].bound : 'target'

    /*
      A floor is missed by falling under it. A ceiling and a target are both
      missed by going over: spending less than a framework's target for living
      costs is not a failure, it is the household getting ahead.
    */
    const verdict: AdherenceVerdict =
      bound === 'min'
        ? actual >= recommended
          ? 'healthy'
          : 'short'
        : actual <= recommended
          ? 'healthy'
          : 'over'

    return {
      labels: buckets.map((bucket) => bucket.label),
      keys: buckets.map((bucket) => bucket.key),
      sources: [...sources],
      bound,
      share,
      recommended,
      actual,
      actualShare: income > 0n ? Number((actual * 10_000n) / income) / 10_000 : null,
      verdict,
      gap: verdict === 'healthy' ? 0n : verdict === 'short' ? recommended - actual : actual - recommended,
      combined: buckets.length > 1,
    }
  })

  const claimed = (['spend', 'debt', 'save'] as const).reduce(
    (sum, source) => sum + pots[source],
    0n,
  )

  return {
    framework,
    income,
    groups,
    unassigned: income - claimed,
    // Ranked by how much has to move rather than by how far off the percentage
    // is. A ten point miss on a bucket worth Rp400rb is not the thing to fix
    // first when a two point miss elsewhere is worth Rp2jt.
    failing: groups
      .filter((group) => group.verdict !== 'healthy')
      .sort((a, b) => (b.gap > a.gap ? 1 : b.gap < a.gap ? -1 : 0)),
  }
}
