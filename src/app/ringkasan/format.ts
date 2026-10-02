import { formatMonthKey } from '@/lib/datetime'
import { formatIdr } from '@/lib/money'

/**
 * How the summary writes its figures, shared by the page and the PDF.
 *
 * A minus is the real minus sign, which is as wide as a digit and does not
 * break a line, rather than the hyphen `formatIdr` prints.
 */

const MINUS = '−'

/** "Rp6.363.333", "−Rp3.271.159". */
export function money(sen: bigint): string {
  return formatIdr(sen).replace(/^-/, MINUS)
}

/** A table cell: the same figure without "Rp", which the table's caption names once. */
export function cell(sen: bigint): string {
  return formatIdr(sen, { symbol: false }).replace(/^-/, MINUS)
}

/** "Jul" for a column, "Jul 2026" for the period line. */
export function monthShort(month: string): string {
  return formatMonthKey(month).split(' ')[0]
}

export function period(months: readonly string[]): string {
  return `${formatMonthKey(months[0])} – ${formatMonthKey(months[months.length - 1])}`
}
