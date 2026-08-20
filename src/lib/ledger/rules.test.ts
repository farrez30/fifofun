import { describe, expect, it } from 'vitest'
import {
  applyRules,
  findConflict,
  firstMatch,
  matches,
  normalise,
  groupBySuggestion,
  suggestPattern,
  type Groupable,
  type Matchable,
  type Rule,
} from './rules'

/**
 * The description shapes below are the real ones from the corpus, with names
 * altered. They matter because a rule is only useful if it survives contact with
 * how the bank actually writes things: the counterparty on line two after "ke",
 * or on line three after a bank name, or on line two with the account number
 * glued behind it and the payer's own note underneath.
 */

let counter = 0
function rule(partial: Partial<Rule> & Pick<Rule, 'pattern'>): Rule {
  counter += 1
  return {
    id: `r${counter}`,
    priority: 100,
    matchType: 'contains',
    cashflow: 'spending',
    categoryId: 'cat-makan',
    autoApply: true,
    hitCount: 0,
    ...partial,
  }
}

function entry(raw: string, id = 'e1'): Matchable {
  return { id, rawDescription: raw, description: raw.split('\n')[0] }
}

/** `description` is what the classifier produced from the raw text beside it. */
function real(description: string, rawDescription: string, id = 'e1'): Matchable {
  return { id, description, rawDescription }
}

describe('matching', () => {
  it('ignores case and collapses whitespace on both sides', () => {
    expect(matches(rule({ pattern: '  ALFAMART  ' }), entry('KD20 MPM   Alfamart Imam Ma'))).toBe(
      true,
    )
  })

  it('matches a prefix only at the start', () => {
    const r = rule({ pattern: 'biaya administrasi', matchType: 'prefix' })
    expect(matches(r, entry('Biaya administrasi rekening'))).toBe(true)
    expect(matches(r, entry('Rekening biaya administrasi'))).toBe(false)
  })

  it('matches exactly only when nothing else is present', () => {
    const r = rule({ pattern: 'gopay', matchType: 'exact' })
    expect(matches(r, entry('GoPay'))).toBe(true)
    expect(matches(r, entry('GoPay - GoPay Bank Transfer ID2509'))).toBe(false)
  })

  it('never matches on an empty pattern, which would swallow the ledger', () => {
    expect(matches(rule({ pattern: '   ' }), entry('apa pun'))).toBe(false)
  })

  it('reads the bank raw text rather than the tidied description', () => {
    // The tidied description is derived. If rules matched on it, changing the
    // classifier would silently unmatch rules written months earlier.
    const row = real('KOPI KENANGAN', 'Pembayaran QR\nke KOPI KENANGAN\n601503995632')
    expect(matches(rule({ pattern: 'pembayaran qr' }), row)).toBe(true)
  })

  it('falls back to the description when there is no raw text', () => {
    expect(matches(rule({ pattern: 'tokopedia' }), { description: 'Tokopedia' })).toBe(true)
  })

  it('matches a row that has not been saved yet, which is what an import has', () => {
    // The import needs the same verdict before it writes anything, so the
    // matcher must not require a primary key it cannot have.
    const unsaved = { description: 'PLN IconPay', rawDescription: 'Pembayaran PLN IconPay 5301' }
    expect(matches(rule({ pattern: 'pln iconpay' }), unsaved)).toBe(true)
  })
})

describe('firstMatch', () => {
  it('lets a lower priority number pre-empt a broader rule', () => {
    const broad = rule({ pattern: 'alfamart', priority: 100, categoryId: 'cat-belanja' })
    const specific = rule({ pattern: 'alfamart imam', priority: 10, categoryId: 'cat-makan' })
    expect(firstMatch([broad, specific], entry('KD20 MPM Alfamart Imam Ma'))?.categoryId).toBe(
      'cat-makan',
    )
  })

  it('is stable when two rules share a priority', () => {
    const a = rule({ id: 'a', pattern: 'kopi', priority: 50 })
    const b = rule({ id: 'b', pattern: 'kopi kenangan', priority: 50 })
    const e = entry('Kopi Kenangan QR BRI')
    expect(firstMatch([a, b], e)?.id).toBe(firstMatch([b, a], e)?.id)
  })

  it('returns null when nothing matches', () => {
    expect(firstMatch([rule({ pattern: 'indomaret' })], entry('Tokopedia'))).toBeNull()
  })
})

describe('applyRules', () => {
  it('assigns each entry at most once', () => {
    const rules = [
      rule({ pattern: 'alfamart', categoryId: 'cat-belanja', priority: 10 }),
      rule({ pattern: 'imam', categoryId: 'cat-makan', priority: 20 }),
    ]
    const assignments = applyRules(rules, [entry('KD20 MPM Alfamart Imam Ma')])
    expect(assignments).toHaveLength(1)
    expect(assignments[0].outcome.categoryId).toBe('cat-belanja')
  })

  it('skips a rule that decides nothing', () => {
    const empty = rule({ pattern: 'alfamart', cashflow: null, categoryId: null })
    expect(applyRules([empty], [entry('Alfamart')])).toEqual([])
  })

  it('leaves entries no rule covers untouched', () => {
    const assignments = applyRules(
      [rule({ pattern: 'alfamart' })],
      [entry('Alfamart', 'a'), entry('Tokopedia', 'b')],
    )
    expect(assignments.map((a) => a.entryId)).toEqual(['a'])
  })
})

describe('suggestPattern', () => {
  it('takes the merchant the classifier already extracted from a QRIS row', () => {
    const row = real('KOPI KENANGAN CONTOH', 'Pembayaran QR\nke KOPI KENANGAN CONTOH\n601503995632')
    expect(suggestPattern(row)).toEqual({ matchType: 'contains', pattern: 'kopi kenangan contoh' })
  })

  it('drops the payment note, so twelve monthly transfers share one pattern', () => {
    // Twelve arisan payments to the same person carried twelve different notes,
    // and reading the raw text produced twelve different patterns.
    const notes = ['arisan desember 2025', 'arisan november 2025', 'arisan mei 2025']
    const rows = notes.map((note) =>
      real(
        `ANIS RENGGANIS - ${note}`,
        `Transfer ke BANK MANDIRI\nANIS RENGGANIS 1160005668471\n${note}`,
      ),
    )
    expect([...new Set(rows.map((row) => suggestPattern(row)?.pattern))]).toEqual(['anis rengganis'])
  })

  it('produces a pattern that actually matches the raw text it came from', () => {
    // The suggester reads the tidied text and the matcher reads the raw text, so
    // this is the seam where the two halves have to agree.
    const row = real(
      'ANIS RENGGANIS - arisan desember 2025',
      'Transfer ke BANK MANDIRI\nANIS RENGGANIS 1160005668471\narisan desember 2025',
    )
    expect(matches(rule({ ...suggestPattern(row)! }), row)).toBe(true)
  })

  it('strips a trailing reference number from a salary line', () => {
    const row = real(
      'MITRA INFOTEK TOTALSOLUSI 202607272040521194',
      'Transfer antar Mandiri\nDARI MITRA INFOTEK TOTALSOLUSI\nSal TUKK 202607272040521194',
    )
    expect(suggestPattern(row)?.pattern).toBe('mitra infotek totalsolusi')
  })

  it('keeps a bare biller name unchanged', () => {
    expect(suggestPattern(real('Midtrans', 'Pembayaran Midtrans\n33437377731'))?.pattern).toBe(
      'midtrans',
    )
  })

  it('refuses to suggest anything too short to identify anyone', () => {
    expect(suggestPattern(real('AB', 'Pembayaran QR\nke AB\n601503995632'))).toBeNull()
  })
})

describe('groupBySuggestion', () => {
  const paid = (description: string, rawDescription: string, amount: bigint, id: string): Groupable => ({
    id,
    description,
    rawDescription,
    amount,
  })

  const arisan = (note: string, id: string) =>
    paid(
      `ANIS RENGGANIS - ${note}`,
      `Transfer ke BANK MANDIRI\nANIS RENGGANIS 1160005668471\n${note}`,
      300_000_00n,
      id,
    )

  it('collapses many payments to one counterparty into a single decision', () => {
    const groups = groupBySuggestion([arisan('arisan mei', 'a'), arisan('arisan juni', 'b')])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ pattern: 'anis rengganis', count: 2, total: 600_000_00n })
  })

  it('ranks by money, not by how many rows there are', () => {
    // Eighty small payments matter less than four large ones, and a queue sorted
    // by count would put them the wrong way round.
    const many = Array.from({ length: 5 }, (_, i) =>
      paid('KOPI KENANGAN', 'Pembayaran QR\nke KOPI KENANGAN\n601503995632', 40_000_00n, `k${i}`),
    )
    const one = paid(
      'SITI KHAFADOH - sewa',
      'Transfer ke BANK MANDIRI\nSITI KHAFADOH 1550004267541\nsewa',
      2_000_000_00n,
      's',
    )
    expect(groupBySuggestion([...many, one]).map((g) => g.pattern)).toEqual([
      'siti khafadoh',
      'kopi kenangan',
    ])
  })

  it('leaves out rows an existing rule already decides', () => {
    const covered = arisan('arisan mei', 'a')
    const rules = [rule({ pattern: 'anis rengganis', categoryId: 'cat-arisan' })]
    expect(groupBySuggestion([covered], rules)).toEqual([])
  })

  it('shows a group whose rows carry different categories as mixed', () => {
    const groups = groupBySuggestion([
      { ...arisan('arisan mei', 'a'), categoryName: 'Other spending' },
      { ...arisan('arisan juni', 'b'), categoryName: 'Keluarga' },
    ])
    expect(groups[0].currentCategories).toEqual(['Other spending', 'Keluarga'])
  })

  it('keeps at most three samples, so one group cannot flood the page', () => {
    const rows = Array.from({ length: 9 }, (_, i) => arisan(`arisan ${i}`, `a${i}`))
    expect(groupBySuggestion(rows)[0].samples).toHaveLength(3)
  })

  it('drops rows with no usable pattern rather than grouping them under nothing', () => {
    const tooShort = paid('AB', 'Pembayaran QR\nke AB\n601503995632', 1_000_00n, 'x')
    expect(groupBySuggestion([tooShort])).toEqual([])
  })
})

describe('findConflict', () => {
  const existing = [rule({ id: 'x', pattern: 'alfamart', priority: 50, matchType: 'contains' })]

  it('reports a rule that already exists', () => {
    const conflict = findConflict(existing, {
      priority: 100,
      matchType: 'contains',
      pattern: 'ALFAMART',
      cashflow: 'spending',
      categoryId: 'cat-belanja',
      autoApply: true,
    })
    expect(conflict).toMatchObject({ kind: 'duplicate', existing: { id: 'x' } })
  })

  it('reports a rule an earlier broader one would swallow', () => {
    // Without this the household thinks it taught the app something, the app
    // keeps behaving as before, and nothing explains the difference.
    const conflict = findConflict(existing, {
      priority: 100,
      matchType: 'contains',
      pattern: 'alfamart imam',
      cashflow: 'spending',
      categoryId: 'cat-makan',
      autoApply: true,
    })
    expect(conflict).toMatchObject({ kind: 'shadowed', existing: { id: 'x' } })
  })

  it('allows a narrower rule that runs earlier', () => {
    expect(
      findConflict(existing, {
        priority: 10,
        matchType: 'contains',
        pattern: 'alfamart imam',
        cashflow: 'spending',
        categoryId: 'cat-makan',
        autoApply: true,
      }),
    ).toBeNull()
  })

  it('allows an unrelated pattern', () => {
    expect(
      findConflict(existing, {
        priority: 100,
        matchType: 'contains',
        pattern: 'indomaret',
        cashflow: 'spending',
        categoryId: 'cat-belanja',
        autoApply: true,
      }),
    ).toBeNull()
  })
})

describe('normalise', () => {
  it('is idempotent, so a pattern stored once keeps matching', () => {
    expect(normalise(normalise('  KOPI   Kenangan '))).toBe(normalise('  KOPI   Kenangan '))
  })
})
