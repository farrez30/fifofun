/**
 * All timestamps in this app are stored as UTC instants and interpreted as
 * Asia/Jakarta (WIB) wall-clock time. Indonesia has never observed daylight
 * saving, so a fixed offset is correct and avoids pulling in a tz database.
 */

export const JAKARTA_OFFSET_MINUTES = 7 * 60

export interface CalendarDate {
  year: number
  month: number // 1-12
  day: number
}

export interface WallTime {
  hour: number
  minute: number
  second: number
}

/**
 * Month abbreviations from both sources. Indonesian and English never collide
 * (Mei/May, Agu/Aug, Okt/Oct, Des/Dec differ; the rest are identical), so one
 * table serves the .xlsx statement and the Livin email alike.
 */
const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  mei: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  agu: 8,
  sep: 9,
  oct: 10,
  okt: 10,
  nov: 11,
  dec: 12,
  des: 12,
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function assertRealDate(date: CalendarDate, source: string): CalendarDate {
  const { year, month, day } = date
  if (month < 1 || month > 12) throw new Error(`Month out of range in ${JSON.stringify(source)}`)
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Day ${day} does not exist in ${month}/${year} (from ${JSON.stringify(source)})`)
  }
  return date
}

const SHORT_DATE = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/

/** Parses "01 Mar 2026" (statement) or "19 Agu 2026" (email). */
export function parseShortDate(raw: string): CalendarDate {
  const s = raw.trim().replace(/\s+/g, ' ')
  const m = SHORT_DATE.exec(s)
  if (!m) throw new Error(`Not a short date: ${JSON.stringify(raw)}`)

  const month = MONTHS[m[2].toLowerCase()]
  if (!month) throw new Error(`Unknown month abbreviation: ${JSON.stringify(m[2])}`)

  return assertRealDate({ year: Number(m[3]), month, day: Number(m[1]) }, raw)
}

const WIB_TIME = /^(\d{2}):(\d{2}):(\d{2})(?:\s*WIB)?$/i

/** Parses "02:51:00 WIB", the time-only continuation row of the e-statement. */
export function parseWibTime(raw: string): WallTime {
  const s = raw.trim().replace(/\s+/g, ' ')
  const m = WIB_TIME.exec(s)
  if (!m) throw new Error(`Not a WIB time: ${JSON.stringify(raw)}`)

  const [hour, minute, second] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Time out of range: ${JSON.stringify(raw)}`)
  }
  return { hour, minute, second }
}

const MIDNIGHT: WallTime = { hour: 0, minute: 0, second: 0 }

/** Combines a Jakarta wall-clock date and time into a UTC instant. */
export function toJakartaInstant(date: CalendarDate, time: WallTime = MIDNIGHT): Date {
  return new Date(
    Date.UTC(
      date.year,
      date.month - 1,
      date.day,
      time.hour,
      time.minute - JAKARTA_OFFSET_MINUTES,
      time.second,
    ),
  )
}

const DAY_MONTH = /^(\d{2})\/(\d{2})$/

/**
 * Parses the "DD/MM" dates of the rekening koran PDF, which omit the year.
 * The year comes from the statement period, adjusted when a row sits on the
 * other side of a new year from the period's own month.
 */
export function parseDayMonthYear(
  raw: string,
  period: { year: number; month: number },
): CalendarDate {
  const m = DAY_MONTH.exec(raw.trim())
  if (!m) throw new Error(`Not a DD/MM date: ${JSON.stringify(raw)}`)

  const day = Number(m[1])
  const month = Number(m[2])

  // A statement never spans more than a few months, so a gap of more than six
  // months means the row belongs to the neighbouring year.
  let year = period.year
  const gap = month - period.month
  if (gap > 6) year -= 1
  else if (gap < -6) year += 1

  return assertRealDate({ year, month, day }, raw)
}

const ID_MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

function jakartaParts(instant: Date): CalendarDate & WallTime {
  const shifted = new Date(instant.getTime() + JAKARTA_OFFSET_MINUTES * 60_000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Renders a UTC instant as Jakarta wall-clock text, matching the source
 * documents. The `iso-` styles are what a date or time input wants as its
 * value, in the same zone, so a form defaults to today in Jakarta rather than
 * today wherever the server happens to run.
 */
export function formatJakarta(
  instant: Date,
  style: 'date' | 'time' | 'datetime' | 'iso-date' | 'iso-time',
): string {
  const p = jakartaParts(instant)
  const date = `${pad(p.day)} ${ID_MONTH_LABELS[p.month - 1]} ${p.year}`
  const time = `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`

  if (style === 'date') return date
  if (style === 'time') return time
  if (style === 'iso-date') return `${p.year}-${pad(p.month)}-${pad(p.day)}`
  if (style === 'iso-time') return `${pad(p.hour)}:${pad(p.minute)}`
  return `${date} ${time}`
}

/**
 * Renders a `YYYY-MM` month key the way a person would say it: "Mar 2027".
 *
 * The keys are what every roll-up in the app is grouped by, and they are exactly
 * what nobody wants to read on a chart. Anything that is not a month key is
 * handed back untouched, so a malformed key shows itself instead of being
 * quietly rendered as some other month.
 */
export function formatMonthKey(key: string, style: 'short' | 'compact' = 'short'): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key)
  if (!match) return key

  const label = ID_MONTH_LABELS[Number(match[2]) - 1]
  return style === 'compact' ? `${label} '${match[1].slice(2)}` : `${label} ${match[1]}`
}
