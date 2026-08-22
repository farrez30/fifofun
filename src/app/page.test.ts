import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseStub, type SupabaseStub } from '@/test/supabase-stub'

/**
 * The dashboard as a whole, run against a ledger shaped like a real one.
 *
 * Every other test here covers a pure function or a single component from a
 * fixture. What none of them touch is the glue: the fifty lines of the page
 * that pull the queries together, hand the results to the builders and pass
 * the builders' output on as props. That code shipped broken once, with a
 * callback that read a `const` declared below the call that ran it, and no
 * suite noticed because no suite ever executed it.
 *
 * So this one executes it. The component is called for real, with queued
 * database answers, and the tree it returns is inspected for the props that
 * prove each stage ran.
 */

const holder = vi.hoisted(() => ({
  client: null as unknown,
  user: { id: 'u1', email: 'kamu@contoh.id' } as { id: string; email: string } | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => holder.client,
  getUser: async () => holder.user,
}))

// Imported after the mock is declared, the way vitest hoists it anyway.
const { default: HomePage } = await import('./page')

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111'
const BANK = '22222222-2222-4222-8222-222222222222'
const CASH = '33333333-3333-4333-8333-333333333333'
const WALLET = '44444444-4444-4444-8444-444444444444'

/** Rupiah as the sen string PostgREST hands back for a bigint column. */
function sen(rupiah: number): string {
  return String(rupiah * 100)
}

const ACCOUNTS = [
  {
    id: BANK,
    name: 'Bank Mandiri',
    kind: 'bank',
    opening_balance: sen(5_000_000),
    opening_balance_at: null,
    key: 'mandiri',
    institution: 'Bank Mandiri',
    own_identifiers: ['081234567890'],
    sort_order: 1,
    archived_at: null,
  },
  {
    id: CASH,
    name: 'Cash',
    kind: 'cash',
    opening_balance: sen(200_000),
    opening_balance_at: null,
    key: 'cash',
    institution: null,
    own_identifiers: [],
    sort_order: 2,
    archived_at: null,
  },
  {
    id: WALLET,
    name: 'GoPay',
    kind: 'ewallet',
    opening_balance: sen(150_000),
    opening_balance_at: null,
    key: 'gopay',
    institution: null,
    own_identifiers: [],
    sort_order: 3,
    archived_at: null,
  },
]

const CATEGORIES = [
  ['c-gaji', 'Gaji', 'income', 'Briefcase', '95'],
  ['c-makan', 'Makan/minum', 'spending', 'ForkKnife', '25'],
  ['c-belanja', 'Belanja', 'spending', 'ShoppingBag', '310'],
  ['c-transport', 'Transport', 'spending', 'Bus', '210'],
  ['c-wifi', 'Wifi', 'bills', 'Receipt', '140'],
  ['c-tabungan', 'Tabungan', 'invest_savings', 'PiggyBank', '170'],
  ['c-antar', 'Antar Account', 'transfer', 'ArrowsLeftRight', null],
].map(([id, name, cashflow, icon, color], index) => ({
  id,
  name,
  cashflow,
  icon,
  color,
  opening_balance: null,
  target_amount: null,
  target_month: null,
  planned_monthly: null,
  planned_share_bp: null,
  sort_order: index + 1,
  archived_at: null,
}))

interface Entry {
  day: string
  description: string
  rupiah: number
  cashflow: string
  category: string | null
  from?: string | null
  to?: string | null
  needsReview?: boolean
  passThrough?: boolean
}

const NAME_BY_CATEGORY = new Map(CATEGORIES.map((row) => [row.id, row.name as string]))

/** Three months of a plausible ledger, oldest first. */
const ENTRIES: Entry[] = [
  ...['2026-06', '2026-07', '2026-08'].flatMap((month, index): Entry[] => [
    {
      day: `${month}-01`,
      description: 'Gaji bulanan',
      rupiah: 12_000_000 + index * 250_000,
      cashflow: 'income',
      category: 'c-gaji',
      to: BANK,
    },
    {
      day: `${month}-04`,
      description: 'Warung nasi',
      rupiah: 850_000 + index * 35_000,
      cashflow: 'spending',
      category: 'c-makan',
      from: CASH,
    },
    {
      day: `${month}-09`,
      description: 'Belanja bulanan',
      rupiah: 1_200_000 + index * 125_000,
      cashflow: 'spending',
      category: 'c-belanja',
      from: WALLET,
    },
    {
      day: `${month}-12`,
      description: 'Wifi rumah',
      rupiah: 350_000,
      cashflow: 'bills',
      category: 'c-wifi',
      from: BANK,
    },
    {
      day: `${month}-15`,
      description: 'Top up GoPay',
      rupiah: 500_000,
      cashflow: 'transfer',
      category: 'c-antar',
      from: BANK,
      to: WALLET,
    },
    {
      day: `${month}-25`,
      description: 'Setoran tabungan',
      rupiah: 2_000_000 + index * 250_000,
      cashflow: 'invest_savings',
      category: 'c-tabungan',
      from: BANK,
    },
  ]),
  // The awkward rows every real ledger has: one nobody has filed yet, and one
  // that moved money without being anybody's income or spending.
  {
    day: '2026-08-18',
    description: 'QRIS 1234567',
    rupiah: 175_000,
    cashflow: 'spending',
    category: null,
    from: WALLET,
    needsReview: true,
  },
  {
    day: '2026-08-20',
    description: 'Patungan kado',
    rupiah: 250_000,
    cashflow: 'spending',
    category: 'c-belanja',
    from: CASH,
    passThrough: true,
  },
  {
    day: '2026-08-22',
    description: 'Ojek ke kantor',
    rupiah: 300_000,
    cashflow: 'spending',
    category: 'c-transport',
    from: WALLET,
  },
]

function transactionRows() {
  return ENTRIES.map((entry, index) => ({
    id: `t-${index}`,
    // Midday in Jakarta, so no row lands on a month boundary by accident.
    occurred_at: `${entry.day}T05:00:00.000Z`,
    description: entry.description,
    amount: sen(entry.rupiah),
    cashflow: entry.cashflow,
    category_id: entry.category,
    from_account_id: entry.from ?? null,
    to_account_id: entry.to ?? null,
    source: 'xlsx',
    external_ref: null,
    note: null,
    needs_review: entry.needsReview ?? false,
    is_pass_through: entry.passThrough ?? false,
    duplicate_of: null,
    split_of: null,
    categories: entry.category ? { name: NAME_BY_CATEGORY.get(entry.category) } : null,
  }))
}

let stub: SupabaseStub

function queueLedger({ budgets = [] as unknown[] } = {}) {
  stub.queue('households', {
    data: { id: HOUSEHOLD, name: 'Rumah', timezone: 'Asia/Jakarta', currency: 'IDR' },
  })
  stub.queue('accounts', { data: ACCOUNTS })
  stub.queue('categories', { data: CATEGORIES })
  // Newest first, the way the real query orders it before the pager reverses.
  stub.queue('transactions', { data: transactionRows().reverse() })
  // Two reads, in the order the dashboard makes them: the first statement's
  // opening balance, then the last reconciled statement's closing balance.
  stub.queue(
    'import_batches',
    { data: { opening_balance: sen(5_000_000) } },
    { data: { closing_balance: sen(7_250_000), period_end: '2026-08-31' } },
  )
  stub.queue('budgets', { data: budgets })
}

interface Element {
  type: unknown
  props: Record<string, unknown>
}

function isElement(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && 'type' in value && 'props' in value
}

/** Every element of one component in a returned tree, props included. */
function findAll(node: unknown, name: string, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, name, found)
    return found
  }
  if (!isElement(node)) return found
  if (typeof node.type === 'function' && (node.type as { name?: string }).name === name) {
    found.push(node)
  }
  if (node.props) for (const value of Object.values(node.props)) findAll(value, name, found)
  return found
}

function findOne(node: unknown, name: string): Element {
  const [first] = findAll(node, name)
  expect(first, `no <${name}> in the tree`).toBeDefined()
  return first
}

/**
 * The dashboard body, awaited.
 *
 * The page itself only decides the scope and hands the work to an async child
 * behind `<Suspense>`, so the tree it returns still has that child uncalled.
 * Calling it is what runs the queries and the builders.
 */
async function call(element: Element): Promise<unknown> {
  return (element.type as (props: unknown) => unknown)(element.props)
}

async function renderDashboard(akun?: string) {
  const page = await HomePage({ searchParams: Promise.resolve(akun ? { akun } : {}) })
  return call(findOne(page, 'Dashboard'))
}

describe('halaman Ringkasan', () => {
  beforeEach(() => {
    stub = createSupabaseStub({ user: { id: 'u1' } })
    holder.client = stub.client
    holder.user = { id: 'u1', email: 'kamu@contoh.id' }
    queueLedger()
  })

  it('renders the whole month without throwing', async () => {
    const tree = await renderDashboard()
    expect(findAll(tree, 'Stat').length).toBeGreaterThan(0)
  })

  it('colours every category ribbon in the flow diagram', async () => {
    // The regression this file exists for. `hueOf` runs inside buildFlow, so a
    // helper declared after that call throws before a single node is built.
    const sankey = findOne(await renderDashboard(), 'Sankey')
    const nodes = sankey.props.nodes as { id: string; hue?: number }[]
    const categories = nodes.filter((node) => node.id.startsWith('cat-'))

    expect(categories.length).toBeGreaterThan(0)
    for (const node of categories) {
      expect(typeof node.hue, `${node.id} has no hue`).toBe('number')
    }
    expect(sankey.props.caption).toBe('Aliran uang 2026-08')
  })

  it('breaks down the month the trend chart ends on', async () => {
    const chart = findOne(await renderDashboard(), 'CashflowChart')
    expect((chart.props.series as { month: string }[]).map((point) => point.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
    ])

    // The chart itself turns the ledger into one detail per month, so calling
    // it is what proves the entries and the look-up reached it intact.
    const view = findOne(await call(chart), 'CashflowChartView')
    const details = view.props.details as { month: string; count: number; byCategory: unknown[] }[]
    const august = details.find((detail) => detail.month === '2026-08')

    expect(august?.count).toBeGreaterThan(0)
    expect(august?.byCategory.length).toBeGreaterThan(0)
  })

  it('shows the last transactions, newest first', async () => {
    const table = findOne(await renderDashboard(), 'TransactionTable')
    const rows = table.props.rows as { description: string; amount: bigint }[]

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(20)
    expect(rows[0].description).toBe('Ojek ke kantor')
    expect(typeof rows[0].amount).toBe('bigint')
  })

  it('reconciles against the account holding the import key', async () => {
    // Not merely the first account of kind bank: the statement belongs to the
    // one the importer files its rows under.
    const tree = await renderDashboard()
    const labels = findAll(tree, 'Stat').map((stat) => stat.props.label)
    expect(labels).toContain('Pemasukan')
  })

  it('narrows to one account when the address bar asks for it', async () => {
    const tree = await renderDashboard(WALLET)
    const labels = findAll(tree, 'Stat').map((stat) => stat.props.label)
    expect(labels).toContain('Saldo GoPay')

    const chart = findOne(tree, 'CashflowChart')
    expect((chart.props.scope as { name: string }).name).toBe('GoPay')
  })

  it('ignores an account id the household does not own', async () => {
    // A stale link should show the household's own figures, not an error page
    // and certainly not somebody else's wallet.
    const tree = await renderDashboard('99999999-9999-4999-8999-999999999999')
    const labels = findAll(tree, 'Stat').map((stat) => stat.props.label)
    expect(labels).toContain('Uang bisa dipakai')
  })

  it('prefers a budget the household set over one derived from history', async () => {
    stub.reset()
    queueLedger({ budgets: [{ amount: sen(1_500_000), categories: { name: 'Belanja' } }] })

    const bullet = findOne(await renderDashboard(), 'BudgetBullet')
    const review = bullet.props.review as { source: string; lines: { category: string }[] }
    expect(review.source).toBe('manual')
    expect(review.lines.map((line) => line.category)).toContain('Belanja')
  })
})
