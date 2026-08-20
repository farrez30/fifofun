import { parseShortDate, parseWibTime, toJakartaInstant } from '@/lib/datetime'
import { parseIdAmount } from '@/lib/money'

/**
 * Parser for Bank Mandiri Livin' transaction emails.
 *
 * These arrive within seconds of a transaction and carry more than the monthly
 * statement does: the merchant name in full rather than truncated to 25
 * characters, the fee already separated from the amount, a reference number, and
 * — most valuable of all — the note the user typed themselves when transferring.
 * That note is the strongest categorisation signal available anywhere, because
 * it is a statement of intent rather than an inference from a description.
 *
 * The design point is the alias table. Two real samples already disagree on what
 * the amount is called (`Nominal Transaksi` against `Jumlah Transfer`) and on
 * what the source account is called (`Sumber Dana` against `Rekening Sumber`),
 * and there are certainly more variants for top-ups, bill payments and
 * withdrawals. Adding a variant therefore has to be adding data, not writing
 * code, and anything unrecognised goes to a review queue rather than being
 * guessed at.
 */

/** Only mail genuinely from this domain is ever considered. */
export const LIVIN_SENDER_DOMAIN = 'bankmandiri.co.id'

export interface FieldAliases {
  amount: string[]
  fee: string[]
  total: string[]
  note: string[]
  reference: string[]
  sourceAccount: string[]
  date: string[]
  time: string[]
  recipient: string[]
}

/**
 * Label variants, ordered most specific first.
 *
 * Every entry here came from a real email or from the same template family.
 * Nothing is invented: a label nobody has seen would silently match the wrong
 * value in some future template.
 */
export const FIELD_ALIASES: FieldAliases = {
  amount: [
    'Nominal Transaksi',
    'Jumlah Transfer',
    'Jumlah Top Up',
    'Nominal Top Up',
    'Jumlah Pembayaran',
    'Nominal Pembelian',
  ],
  fee: ['Biaya Transaksi', 'Biaya Admin', 'Biaya Transfer'],
  total: ['Total Transaksi', 'Total Pembayaran'],
  note: ['Keterangan', 'Berita'],
  reference: ['No. Referensi', 'Nomor Referensi', 'No Referensi'],
  sourceAccount: ['Sumber Dana', 'Rekening Sumber', 'Rekening Asal'],
  date: ['Tanggal', 'Tanggal Transaksi'],
  time: ['Jam', 'Waktu'],
  recipient: ['Penerima', 'Tujuan', 'Merchant'],
}

export type LivinKind = 'payment' | 'transfer' | 'topup' | 'purchase' | 'unknown'

/** Subject lines seen so far, mapped to what the email is about. */
const SUBJECT_KINDS: { match: RegExp; kind: LivinKind }[] = [
  { match: /pembayaran berhasil/i, kind: 'payment' },
  { match: /transfer berhasil/i, kind: 'transfer' },
  { match: /top\s*up berhasil/i, kind: 'topup' },
  { match: /pembelian berhasil/i, kind: 'purchase' },
]

export interface LivinTransaction {
  kind: LivinKind
  /** Merchant or recipient name, in full. */
  recipient: string | null
  /** Virtual account, phone number or account number the money went to. */
  destination: string | null
  /** Where the destination is held, when the email says. */
  destinationBank: string | null
  occurredAt: Date
  amount: bigint
  fee: bigint
  /** Present only when the email states it, and asserted against amount + fee. */
  total: bigint | null
  reference: string
  /** What the user typed when sending. The best categorisation signal there is. */
  note: string | null
  /** Masked source account, such as `****4257`. */
  sourceAccountMask: string | null
  /** Kept forever: the template will change and old mail must stay re-readable. */
  raw: string
}

export interface ParseProblem {
  kind: 'missing-field' | 'unparsable' | 'total-mismatch' | 'unknown-template'
  field?: string
  detail: string
}

export interface LivinParseResult {
  transaction: LivinTransaction | null
  problems: ParseProblem[]
  /** True when the email parsed cleanly enough to enter the ledger unattended. */
  ok: boolean
}

// --- Authenticity ------------------------------------------------------

export interface SenderCheck {
  /** The envelope or header From address. */
  from: string
  /** The raw `Authentication-Results` header, if the provider supplied one. */
  authenticationResults?: string
}

export interface SenderVerdict {
  trusted: boolean
  reasons: string[]
}

/**
 * Whether an email genuinely came from the bank.
 *
 * This app writes to a financial ledger based on the contents, and mail claiming
 * to be from a bank is the oldest phishing target there is. A display name
 * proves nothing, so the domain must match exactly and SPF, DKIM and DMARC must
 * all pass. Anything short of that never enters the ledger unattended.
 */
export function verifySender(check: SenderCheck): SenderVerdict {
  const reasons: string[] = []

  const address = check.from.match(/<([^>]+)>/)?.[1] ?? check.from
  const domain = address.trim().toLowerCase().split('@')[1] ?? ''

  // Exact match or a subdomain, never a suffix match: `notbankmandiri.co.id`
  // ends with the same letters and belongs to somebody else entirely.
  const domainOk = domain === LIVIN_SENDER_DOMAIN || domain.endsWith(`.${LIVIN_SENDER_DOMAIN}`)
  if (!domainOk) reasons.push(`Pengirim ${domain || 'tidak diketahui'} bukan ${LIVIN_SENDER_DOMAIN}`)

  const auth = (check.authenticationResults ?? '').toLowerCase()
  for (const mechanism of ['spf', 'dkim', 'dmarc']) {
    if (!new RegExp(`\\b${mechanism}=pass\\b`).test(auth)) {
      reasons.push(`${mechanism.toUpperCase()} tidak lulus`)
    }
  }

  return { trusted: reasons.length === 0, reasons }
}

// --- Field extraction --------------------------------------------------

/**
 * Reads a labelled value out of the plain-text body.
 *
 * Two layouts appear in the same email. Inline fields put the label and value on
 * one line separated by a tab or a run of spaces; block fields put the label on
 * its own line with the value beneath. Extraction is therefore driven by the
 * label rather than by line offsets, which also survives the template gaining or
 * losing a row.
 */
function readField(lines: string[], labels: string[]): string | null {
  for (const label of labels) {
    for (const [index, line] of lines.entries()) {
      const trimmed = line.trim()
      if (!trimmed.startsWith(label)) continue

      const inline = trimmed.slice(label.length).replace(/^[:\t ]+/, '').trim()
      if (inline) return inline

      // Label alone on its line: the value is the next non-empty line.
      for (let next = index + 1; next < lines.length; next += 1) {
        const candidate = lines[next].trim()
        if (candidate) return candidate
      }
    }
  }
  return null
}

/** Every non-empty line following a label, until the next known label. */
function readBlock(lines: string[], labels: string[], allLabels: string[]): string[] {
  for (const label of labels) {
    const start = lines.findIndex((line) => line.trim() === label)
    if (start === -1) continue

    const collected: string[] = []
    for (let i = start + 1; i < lines.length; i += 1) {
      const value = lines[i].trim()
      if (!value) continue
      if (allLabels.some((other) => value.startsWith(other))) break
      collected.push(value)
    }
    return collected
  }
  return []
}

/**
 * Reads an amount written as `IDR 55.432,00` or `Rp 50.377,00`.
 *
 * Both prefixes appear, in the same template family, for no reason anyone
 * outside the bank could explain. The digits are Indonesian either way.
 */
export function parseLivinAmount(raw: string): bigint {
  const digits = raw.replace(/^\s*(IDR|Rp\.?)\s*/i, '').trim()
  return parseIdAmount(digits)
}

export function classifySubject(subject: string): LivinKind {
  return SUBJECT_KINDS.find((entry) => entry.match.test(subject))?.kind ?? 'unknown'
}

export interface ParseOptions {
  subject: string
  /** The `text/plain` part. Far more stable across template changes than HTML. */
  body: string
}

export function parseLivinEmail({ subject, body }: ParseOptions): LivinParseResult {
  const problems: ParseProblem[] = []
  const lines = body.split(/\r?\n/)
  const allLabels = Object.values(FIELD_ALIASES).flat()

  const kind = classifySubject(subject)
  if (kind === 'unknown') {
    problems.push({
      kind: 'unknown-template',
      detail: `Subjek "${subject}" belum dikenali, jadi isinya tidak ditebak.`,
    })
  }

  const dateText = readField(lines, FIELD_ALIASES.date)
  const timeText = readField(lines, FIELD_ALIASES.time)
  const amountText = readField(lines, FIELD_ALIASES.amount)
  const reference = readField(lines, FIELD_ALIASES.reference)

  for (const [field, value] of [
    ['Tanggal', dateText],
    ['Jam', timeText],
    ['Nominal', amountText],
    ['No. Referensi', reference],
  ] as const) {
    if (!value) problems.push({ kind: 'missing-field', field, detail: `${field} tidak ditemukan.` })
  }

  if (!dateText || !timeText || !amountText || !reference) {
    return { transaction: null, problems, ok: false }
  }

  let occurredAt: Date
  let amount: bigint
  try {
    occurredAt = toJakartaInstant(parseShortDate(dateText), parseWibTime(timeText))
    amount = parseLivinAmount(amountText)
  } catch (error) {
    problems.push({
      kind: 'unparsable',
      detail: error instanceof Error ? error.message : 'Tanggal atau nominal tidak terbaca.',
    })
    return { transaction: null, problems, ok: false }
  }

  const feeText = readField(lines, FIELD_ALIASES.fee)
  const totalText = readField(lines, FIELD_ALIASES.total)
  const fee = feeText ? parseLivinAmount(feeText) : 0n
  const total = totalText ? parseLivinAmount(totalText) : null

  // The email states all three, so the arithmetic can be checked rather than
  // trusted. A mismatch means a label was read as the wrong field.
  if (total !== null && amount + fee !== total) {
    problems.push({
      kind: 'total-mismatch',
      detail: `Nominal ${amount} ditambah biaya ${fee} tidak sama dengan total ${total}.`,
    })
  }

  const recipientLines = readBlock(lines, FIELD_ALIASES.recipient, allLabels)
  const [recipient = null, destinationLine = null] = recipientLines

  // `Bank Mandiri - 1570006217393` carries both the bank and the number.
  const split = destinationLine?.match(/^(.*?)\s+-\s+(\S+)$/)

  return {
    transaction: {
      kind,
      recipient,
      destination: split ? split[2] : destinationLine,
      destinationBank: split ? split[1] : null,
      occurredAt,
      amount,
      fee,
      total,
      reference,
      note: readField(lines, FIELD_ALIASES.note),
      sourceAccountMask: readField(lines, FIELD_ALIASES.sourceAccount),
      raw: body,
    },
    problems,
    // A recognised template with consistent arithmetic. Anything else is still
    // returned, but marked for a human rather than posted automatically.
    ok: problems.length === 0,
  }
}
