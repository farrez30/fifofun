import { describe, expect, it } from 'vitest'
import { parseIdAmount as idr } from '@/lib/money'
import { buildFlow } from './flow'
import type { MonthlyStatement } from './monthly'
import type { CashflowType, LedgerEntry } from './types'

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

let seq = 0
function entry(cashflow: CashflowType, categoryName: string, amount: string) {
  seq += 1
  return {
    id: `e${seq}`,
    occurredAt: new Date('2026-02-10T05:00:00.000Z'),
    description: categoryName,
    amount: idr(amount),
    cashflow,
    categoryId: null,
    categoryName,
    fromAccountId: 'acc',
    toAccountId: null,
    source: 'manual' as LedgerEntry['source'],
  }
}

/** Column one nodes, which is where the destinations live. */
const destinations = (flow: ReturnType<typeof buildFlow>) =>
  flow.nodes.filter((node) => node.column === 1).map((node) => node.id)

/** Column two nodes, which is whatever got broken down. */
const breakdown = (flow: ReturnType<typeof buildFlow>) =>
  flow.nodes.filter((node) => node.column === 2).map((node) => node.label)

describe('buildFlow', () => {
  it('gives every destination that moved a node, and none to the rest', () => {
    const flow = buildFlow(
      statement({
        income: idr('8.171.629,00'),
        bills: idr('2.690.151,00'),
        spending: idr('3.830.737,00'),
      }),
      [],
    )

    // Investasi, sinking fund, tujuan and cicilan were all nothing that month.
    // A node apiece would be four labels explaining that nothing happened.
    expect(destinations(flow)).toEqual(['spending', 'bills', 'kept'])
  })

  it('draws what was not spent as a destination of its own', () => {
    // Otherwise the ribbons leaving Pemasukan add up to less than Pemasukan and
    // the diagram quietly fails to balance.
    const flow = buildFlow(statement({ income: idr('1.000.000,00'), spending: idr('400.000,00') }), [])
    const kept = flow.links.find((link) => link.target === 'kept')
    expect(kept?.value).toBe(idr('600.000,00'))
  })

  it('counts the opening balance out of what was kept', () => {
    // Sisa uang carries last month's balance forward. Drawing it as this month's
    // leftover would show income arriving that never did.
    const flow = buildFlow(
      statement({
        saldoAwal: idr('3.398.413,00'),
        income: idr('1.000.000,00'),
        spending: idr('400.000,00'),
      }),
      [],
    )
    expect(flow.links.find((link) => link.target === 'kept')?.value).toBe(idr('600.000,00'))
  })

  it('breaks down the largest destination rather than always the spending', () => {
    /*
      The rule the description always claimed and the code did not follow. A
      household paying eleven subscriptions and buying two kinds of groceries was
      shown the groceries, every month, with nothing admitting the choice.
    */
    const flow = buildFlow(
      statement({ income: idr('10.000.000,00'), bills: idr('3.000.000,00'), spending: idr('1.000.000,00') }),
      [
        entry('spending', 'Makan/minum', '600.000,00'),
        entry('spending', 'Jajan', '400.000,00'),
        entry('bills', 'Kontrakan', '2.000.000,00'),
        entry('bills', 'Wifi', '600.000,00'),
        entry('bills', 'Spotify', '400.000,00'),
      ],
    )

    expect(flow.foldedInto).toBe('Tagihan')
    expect(breakdown(flow)).toEqual(['Kontrakan', 'Wifi', 'Spotify'])
    expect(flow.links.filter((link) => link.source === 'bills')).toHaveLength(3)
  })

  it('still picks spending when spending is the larger one', () => {
    const flow = buildFlow(
      statement({ income: idr('10.000.000,00'), bills: idr('1.000.000,00'), spending: idr('4.000.000,00') }),
      [
        entry('spending', 'Makan/minum', '3.000.000,00'),
        entry('spending', 'Jajan', '1.000.000,00'),
        entry('bills', 'Wifi', '600.000,00'),
        entry('bills', 'Spotify', '400.000,00'),
      ],
    )
    expect(flow.foldedInto).toBe('Pengeluaran')
    expect(breakdown(flow)).toEqual(['Makan/minum', 'Jajan'])
  })

  it('leaves a single-category destination alone', () => {
    // One category breaks down into one ribbon of its parent's own width, which
    // is a whole column restating what the column before it already said.
    const flow = buildFlow(
      statement({ income: idr('10.000.000,00'), bills: idr('5.000.000,00'), spending: idr('1.000.000,00') }),
      [
        entry('bills', 'Kontrakan', '5.000.000,00'),
        entry('spending', 'Makan/minum', '600.000,00'),
        entry('spending', 'Jajan', '400.000,00'),
      ],
    )
    expect(flow.foldedInto).toBe('Pengeluaran')
  })

  it('draws nothing in the third column when nothing can be broken down', () => {
    const flow = buildFlow(statement({ income: idr('5.000.000,00'), spending: idr('1.000.000,00') }), [
      entry('spending', 'Makan/minum', '1.000.000,00'),
    ])
    expect(breakdown(flow)).toEqual([])
    expect(flow.foldedInto).toBeNull()
    expect(flow.folded).toEqual([])
  })

  it('names six categories and gathers the tail into one node', () => {
    const names = ['Makan/minum', 'Transport', 'Belanja', 'Jajan', 'Hiburan', 'Kesehatan', 'Bensin', 'Dating']
    const flow = buildFlow(
      statement({ income: idr('10.000.000,00'), spending: idr('3.600.000,00') }),
      names.map((name, index) => entry('spending', name, `${800 - index * 100}.000,00`)),
    )

    expect(breakdown(flow)).toEqual([...names.slice(0, 6), '2 kategori lain'])
    // Twenty ribbons a pixel wide carry nothing and make the thick ones
    // unreadable, so the tail is folded. What it holds still has to be
    // reachable, which is why it comes back rather than being dropped.
    expect(flow.folded.map((row) => row.category)).toEqual(['Bensin', 'Dating'])
    expect(flow.links.find((link) => link.target === 'cat-rest')?.value).toBe(
      idr('200.000,00') + idr('100.000,00'),
    )
  })

  it('gathers the tail only when there is one', () => {
    const names = ['Makan/minum', 'Transport', 'Belanja']
    const flow = buildFlow(
      statement({ income: idr('10.000.000,00'), spending: idr('600.000,00') }),
      names.map((name, index) => entry('spending', name, `${300 - index * 100}.000,00`)),
    )
    expect(breakdown(flow)).toEqual(names)
    expect(flow.folded).toEqual([])
  })

  it('has every ribbon reach a node that exists', () => {
    // A link naming a node the layout never placed is silently dropped when it
    // is drawn, so the diagram loses money without saying anything.
    const flow = buildFlow(
      statement({
        income: idr('8.171.629,00'),
        bills: idr('2.690.151,00'),
        spending: idr('3.830.737,00'),
        investSavings: idr('500.000,00'),
      }),
      [
        entry('spending', 'Makan/minum', '2.000.000,00'),
        entry('spending', 'Jajan', '1.830.737,00'),
        entry('bills', 'Kontrakan', '2.690.151,00'),
      ],
    )

    const ids = new Set(flow.nodes.map((node) => node.id))
    for (const link of flow.links) {
      expect(ids.has(link.source), link.source).toBe(true)
      expect(ids.has(link.target), link.target).toBe(true)
    }
  })

  it('has the ribbons out of income add back up to the income', () => {
    // The claim the picture makes just by being a Sankey. If it were ever false
    // the diagram would be showing money appearing or vanishing mid flow.
    const month = statement({
      income: idr('8.171.629,00'),
      bills: idr('2.690.151,00'),
      spending: idr('3.830.737,00'),
      investSavings: idr('500.000,00'),
    })
    const flow = buildFlow(month, [])
    const out = flow.links
      .filter((link) => link.source === 'in')
      .reduce((sum, link) => sum + link.value, 0n)
    expect(out).toBe(month.income)
  })
})
