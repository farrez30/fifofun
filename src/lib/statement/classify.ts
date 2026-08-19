import type { StatementRow } from './mandiri-xlsx'

/**
 * Turns a bank statement row into bank-level semantics: what kind of movement
 * it is, who the counterparty is, and whether the money actually left the
 * user's control or merely moved between their own accounts.
 *
 * It deliberately stops short of assigning a budget category. Bank semantics
 * are deterministic and belong here; "is this Makan/minum or Jajan" is a user
 * preference that belongs in the learned category rules.
 *
 * Every pattern below was derived from 1,591 real transactions spanning
 * September 2024 to July 2026, not from guesswork. Mandiri publishes no
 * specification for these strings, so they are treated as observed and
 * fragile: unmatched rows are reported as `unknown` rather than guessed at.
 */

export type Direction = 'in' | 'out'

export type TransactionKind =
  | 'qris-payment'
  | 'ecommerce-card'
  | 'biller-payment'
  | 'wallet-topup'
  | 'wallet-withdrawal'
  | 'transfer-out'
  | 'transfer-in'
  | 'salary'
  | 'bonus'
  | 'cash-withdrawal'
  | 'bank-fee'
  | 'refund'
  | 'unknown'

export type Channel =
  | 'qris'
  | 'card'
  | 'biller'
  | 'intrabank'
  | 'bifast'
  | 'atm'
  | 'emoney'
  | 'fee'
  | 'unknown'

export interface Counterparty {
  name: string | null
  /** Account or destination identifier printed next to the name. */
  account: string | null
  /** Counterparty's bank, which BI Fast prints on its own line. */
  institution?: string | null
  /**
   * True when the bank cut the name off at a known field limit, so the value
   * must be matched by prefix rather than compared for equality.
   */
  truncated: boolean
}

export interface Classification {
  kind: TransactionKind
  channel: Channel
  direction: Direction
  counterparty: Counterparty
  /** The user's own free-text note ("Berita"), capped by the bank at 20 chars. */
  note: string | null
  reference: string | null
  /**
   * True when this movement stays inside the user's own money: a wallet top-up,
   * a cash withdrawal, or funds returning from an e-wallet. These must not be
   * counted as income or expense.
   */
  ownFunds: boolean
  /** A fee that belongs to another transaction rather than standing alone. */
  isChildFee: boolean
  confidence: 'high' | 'medium' | 'low'
  ruleId: string
}

/**
 * Field widths the bank truncates at, confirmed against the corpus:
 * QRIS merchant names cap at 25 (EMVCo tag 59), intrabank counterparty names
 * at 20, and the free-text note at 20.
 */
export const QRIS_NAME_LIMIT = 25
export const TRANSFER_NAME_LIMIT = 20

export interface ClassifyOptions {
  /**
   * Phone numbers and e-money card numbers belonging to the user. A wallet
   * top-up to one of these is the user's own money moving; to anything else it
   * is a payment to another person.
   */
  ownIdentifiers?: string[]
  /**
   * Institutions whose incoming transfers are salary rather than a refund.
   * Per-user configuration: with none set, an employer transfer is reported as
   * an ordinary incoming transfer rather than guessed at as salary.
   */
  employerNames?: string[]
}

/**
 * E-wallet operators settling money back to the bank account. An arrival from
 * one of these is the user's own balance being withdrawn, not new income.
 *
 * Payment rails such as Flip deliberately do NOT belong here: money arriving
 * through Flip was sent by another person, and the note carries that person's
 * own description of what it was for. Treating a rail as a wallet produced a
 * negative Flip balance of several million rupiah when tested on real data.
 */
const OWN_FUNDS_SENDERS = [
  { match: /DOMPET ANAK BANGSA/i, label: 'GoPay' },
  { match: /AIRPAY INTERNATIONAL/i, label: 'ShopeePay' },
  { match: /VISIONET INTERNASIONAL/i, label: 'OVO' },
  { match: /ESPAY DEBIT INDONESIA/i, label: 'DANA' },
]

/** Payment rails: a counterparty here is a conduit, never the real payer. */
const PAYMENT_RAILS = [{ match: /FLIPTECH LENTERA/i, label: 'Flip' }]

/** Salary and bonus notes observed in the corpus, all truncated at 20 chars. */
const SALARY_NOTE = /^(sal\b|salary|gaji|rapel\s+sal)/i
const BONUS_NOTE = /^(thr|bonus)\b/i

function stripPrefix(text: string, prefix: RegExp): string {
  return text.replace(prefix, '').trim()
}

function digitsOnly(text: string): string {
  return text.replace(/\D/g, '')
}

/** Normalises a phone number so 0812…, 62812… and +62812… compare equal. */
export function normalisePhone(raw: string): string {
  const digits = digitsOnly(raw)
  if (digits.startsWith('62')) return `0${digits.slice(2)}`
  if (digits.startsWith('0')) return digits
  return digits
}

function matchesOwn(candidate: string, own: string[]): boolean {
  const target = normalisePhone(candidate)
  if (target === '') return false
  return own.some((identifier) => {
    const normalised = normalisePhone(identifier)
    return normalised !== '' && (target === normalised || target.endsWith(normalised))
  })
}

/**
 * Splits "SITI RAHAYU 1230000000002" into a name and an account number.
 * The name is capped at 20 characters by the bank, so a name of exactly that
 * length is flagged as truncated.
 */
function splitNameAndAccount(line: string, limit: number): Counterparty {
  const m = /^(.*?)\s+(\d{6,})$/.exec(line.trim())
  if (!m) {
    const name = line.trim()
    return { name: name || null, account: null, truncated: name.length >= limit }
  }
  const name = m[1].trim()
  return { name: name || null, account: m[2], truncated: name.length >= limit }
}

function merchantOf(line: string, limit: number): Counterparty {
  const name = line.trim()
  const explicitlyCut = name.endsWith('...')
  const cleaned = explicitlyCut ? name.slice(0, -3).trim() : name
  return {
    name: cleaned || null,
    account: null,
    truncated: explicitlyCut || cleaned.length >= limit,
  }
}

const EMPTY_COUNTERPARTY: Counterparty = { name: null, account: null, truncated: false }

function base(row: StatementRow): Pick<Classification, 'direction'> {
  return { direction: row.amountIn > 0n ? 'in' : 'out' }
}

/** Fee rows that belong to a parent transaction rather than standing alone. */
const CHILD_FEE = /^Biaya (transaksi bank|transfer BI Fast|Transfer QR|penarikan tunai)/i
/** Fees charged against the account itself, with no parent transaction. */
const ACCOUNT_FEE = /^Biaya (administrasi|gagal transaksi)/i

export function classify(row: StatementRow, options: ClassifyOptions = {}): Classification {
  const own = options.ownIdentifiers ?? []
  const employers = options.employerNames ?? []
  const [first = '', second = '', third = '', fourth = ''] = row.lines
  const direction = base(row).direction

  const make = (
    fields: Partial<Classification> & Pick<Classification, 'kind' | 'channel' | 'ruleId'>,
  ): Classification => ({
    direction,
    counterparty: EMPTY_COUNTERPARTY,
    note: null,
    reference: null,
    ownFunds: false,
    isChildFee: false,
    confidence: 'high',
    ...fields,
  })

  // --- Fees -------------------------------------------------------------
  if (CHILD_FEE.test(first)) {
    return make({
      kind: 'bank-fee',
      channel: 'fee',
      isChildFee: true,
      // The second line names the parent transaction's kind, which pairs it up
      // alongside the identical timestamp.
      note: second || null,
      ruleId: 'fee.child',
    })
  }
  if (ACCOUNT_FEE.test(first)) {
    return make({ kind: 'bank-fee', channel: 'fee', note: first, ruleId: 'fee.account' })
  }

  // --- QRIS -------------------------------------------------------------
  if (/^Pembayaran QR$/i.test(first)) {
    return make({
      kind: 'qris-payment',
      channel: 'qris',
      counterparty: merchantOf(stripPrefix(second, /^ke\s+/i), QRIS_NAME_LIMIT),
      reference: /^\d+$/.test(third) ? third : null,
      ruleId: 'qris.payment',
    })
  }
  if (/^Transfer QR ke /i.test(first)) {
    return make({
      kind: 'transfer-out',
      channel: 'qris',
      counterparty: merchantOf(stripPrefix(first, /^Transfer QR ke\s+/i), QRIS_NAME_LIMIT),
      reference: /^\d+$/.test(third) ? third : null,
      ruleId: 'qris.transfer',
    })
  }

  // --- Card e-commerce --------------------------------------------------
  if (/^Transaksi e-Commerce$/i.test(first)) {
    return make({
      kind: 'ecommerce-card',
      channel: 'card',
      counterparty: merchantOf(stripPrefix(second, /^VAP-/i), 15),
      ruleId: 'card.ecommerce',
    })
  }
  if (/^Koreksi transaksi e-Commerce$/i.test(first)) {
    return make({
      kind: 'refund',
      channel: 'card',
      counterparty: merchantOf(stripPrefix(second, /^VAP-/i), 15),
      ruleId: 'card.refund',
    })
  }

  // --- Cash -------------------------------------------------------------
  if (/^Penarikan tunai di ATM/i.test(first)) {
    return make({
      kind: 'cash-withdrawal',
      channel: 'atm',
      counterparty: { name: second || null, account: null, truncated: false },
      // Cash is still the user's money; it moves to the Cash account.
      ownFunds: true,
      ruleId: 'atm.withdrawal',
    })
  }

  // --- e-Money card -----------------------------------------------------
  if (/^Top-up e-money$/i.test(first)) {
    return make({
      kind: 'wallet-topup',
      channel: 'emoney',
      counterparty: { name: 'e-Money', account: second || null, truncated: false },
      ownFunds: true,
      ruleId: 'emoney.topup',
    })
  }

  // --- Intra-Mandiri transfers -----------------------------------------
  if (/^Transfer (ke|dari) BANK MANDIRI$/i.test(first)) {
    const outgoing = /ke/i.test(first.split(' ')[1] ?? '')
    return make({
      kind: outgoing ? 'transfer-out' : 'transfer-in',
      channel: 'intrabank',
      counterparty: splitNameAndAccount(second, TRANSFER_NAME_LIMIT),
      note: third || null,
      ruleId: outgoing ? 'intrabank.out' : 'intrabank.in',
    })
  }

  // --- Incoming institutional transfers --------------------------------
  if (/^Transfer antar Mandiri$/i.test(first)) {
    const sender = stripPrefix(second, /^DARI\s+/i)
    const note = third || null
    const settlement = OWN_FUNDS_SENDERS.find((entry) => entry.match.test(sender))

    if (settlement) {
      return make({
        kind: 'wallet-withdrawal',
        channel: 'intrabank',
        counterparty: { name: settlement.label, account: null, truncated: false },
        note,
        reference: fourth || null,
        // Money returning from the user's own e-wallet is not income.
        ownFunds: true,
        ruleId: 'intrabank.settlement',
      })
    }

    const rail = PAYMENT_RAILS.find((entry) => entry.match.test(sender))
    if (rail) {
      // Somebody else paid the user through this rail; the note is their reason.
      return make({
        kind: direction === 'in' ? 'transfer-in' : 'transfer-out',
        channel: 'intrabank',
        counterparty: { name: rail.label, account: null, truncated: false },
        note,
        reference: fourth || null,
        ruleId: 'intrabank.rail',
      })
    }

    const fromEmployer = employers.some((name) =>
      sender.toUpperCase().includes(name.toUpperCase()),
    )
    if (fromEmployer && note && BONUS_NOTE.test(note)) {
      return make({
        kind: 'bonus',
        channel: 'intrabank',
        counterparty: { name: sender, account: null, truncated: false },
        note,
        ruleId: 'intrabank.bonus',
      })
    }
    if (fromEmployer && note && SALARY_NOTE.test(note)) {
      return make({
        kind: 'salary',
        channel: 'intrabank',
        counterparty: { name: sender, account: null, truncated: false },
        note,
        ruleId: 'intrabank.salary',
      })
    }

    return make({
      kind: direction === 'in' ? 'transfer-in' : 'transfer-out',
      channel: 'intrabank',
      counterparty: { name: sender || null, account: null, truncated: false },
      note,
      confidence: 'medium',
      ruleId: 'intrabank.other',
    })
  }

  // --- BI Fast ----------------------------------------------------------
  if (/^Transfer BI Fast$/i.test(first) || /^Transfer (dari|ke) Bank lain$/i.test(first)) {
    const incoming = /^Dari\b/i.test(second) || /dari/i.test(first)
    const bank = stripPrefix(second, /^(Dari|Ke)\s*/i)
    // Shape: "Transfer BI Fast" / "Dari <BANK>" / "<NAME> <account>" / "<note>"
    return make({
      kind: incoming ? 'transfer-in' : 'transfer-out',
      channel: 'bifast',
      counterparty: {
        ...splitNameAndAccount(third, TRANSFER_NAME_LIMIT),
        institution: bank || null,
      },
      note: fourth || null,
      ruleId: incoming ? 'bifast.in' : 'bifast.out',
      // The bank name is occasionally blank in the source data.
      confidence: bank ? 'high' : 'medium',
    })
  }

  // --- Wallet top-ups and biller payments -------------------------------
  const wallet = WALLET_BILLERS.find((entry) => entry.match.test(first))
  if (wallet) {
    const destination = wallet.extract(second)
    const isOwn = matchesOwn(destination, own)
    return make({
      kind: isOwn ? 'wallet-topup' : 'transfer-out',
      channel: 'biller',
      counterparty: { name: wallet.label, account: destination || null, truncated: false },
      ownFunds: isOwn,
      // Without a configured phone number we cannot tell a top-up from a
      // payment to someone else, so say so instead of guessing.
      confidence: own.length === 0 ? 'low' : 'high',
      ruleId: `wallet.${wallet.id}`,
    })
  }

  if (/^Pembayaran /i.test(first)) {
    return make({
      kind: 'biller-payment',
      channel: 'biller',
      counterparty: {
        name: stripPrefix(first, /^Pembayaran\s+/i) || null,
        account: second || null,
        truncated: false,
      },
      ruleId: 'biller.payment',
    })
  }

  return make({
    kind: 'unknown',
    channel: 'unknown',
    counterparty: { name: first || null, account: second || null, truncated: false },
    confidence: 'low',
    ruleId: 'unknown',
  })
}

/**
 * E-wallet top-up billers. The destination embeds the user's phone number
 * behind a fixed biller prefix, which is what distinguishes topping up your own
 * wallet from sending money to somebody else's.
 */
const WALLET_BILLERS = [
  {
    id: 'gopay',
    label: 'GoPay',
    match: /^Pembayaran GoPay Customer$/i,
    extract: (line: string) => digitsOnly(line),
  },
  {
    id: 'shopeepay',
    label: 'ShopeePay',
    match: /^Pembayaran ShopeePay$/i,
    // 893 + phone number
    extract: (line: string) => digitsOnly(line).replace(/^893/, ''),
  },
  {
    id: 'dana',
    label: 'DANA',
    match: /^Pembayaran Danatopup$/i,
    // 89508 + phone number
    extract: (line: string) => digitsOnly(line).replace(/^89508/, ''),
  },
  {
    id: 'ovo',
    label: 'OVO',
    match: /^Pembayaran OVO$/i,
    extract: (line: string) => digitsOnly(line),
  },
  {
    id: 'linkaja',
    label: 'LinkAja',
    match: /^Pembayaran LinkAja$/i,
    extract: (line: string) => digitsOnly(line),
  },
] as const
