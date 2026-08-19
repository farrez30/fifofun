import { XMLParser } from 'fast-xml-parser'
import { strFromU8, unzipSync } from 'fflate'

/**
 * A deliberately small .xlsx reader.
 *
 * An .xlsx is a ZIP of XML parts, and this app only ever reads bank statements
 * whose layout we already know. Unzipping and walking the sheet XML directly
 * costs less code than adapting a general spreadsheet library, and avoids the
 * `xlsx` (SheetJS) package, which is frozen on npm at 0.18.5 with an unpatched
 * prototype-pollution advisory (CVE-2023-30533) that triggers on file read.
 */

export type CellKind = 'empty' | 'text' | 'number'

export interface Cell {
  /** Cell text exactly as stored, with rich-text runs concatenated. */
  text: string
  kind: CellKind
  /** Numeric value when the cell was stored as a number, not as text. */
  number?: number
}

export interface Sheet {
  name: string
  /** Dense grid: rows[r][c], zero-based, A1 at rows[0][0]. Always rectangular. */
  rows: Cell[][]
  merges: MergeRange[]
}

export interface MergeRange {
  top: number
  left: number
  bottom: number
  right: number
}

export const EMPTY_CELL: Cell = Object.freeze({ text: '', kind: 'empty' })

/** Converts a column label to a zero-based index: A -> 0, Z -> 25, AA -> 26. */
export function columnToIndex(label: string): number {
  let index = 0
  for (const ch of label) {
    const value = ch.toUpperCase().charCodeAt(0) - 64
    if (value < 1 || value > 26) throw new Error(`Not a column label: ${JSON.stringify(label)}`)
    index = index * 26 + value
  }
  return index - 1
}

const CELL_REF = /^([A-Za-z]+)(\d+)$/

/** Splits a cell reference such as "AB12" into zero-based row and column. */
export function parseCellRef(ref: string): { row: number; col: number } {
  const m = CELL_REF.exec(ref)
  if (!m) throw new Error(`Not a cell reference: ${JSON.stringify(ref)}`)
  return { row: Number(m[2]) - 1, col: columnToIndex(m[1]) }
}

/** Reads the text out of a `<t>` node, which may or may not carry attributes. */
function textOf(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  const record = node as Record<string, unknown>
  if ('#text' in record) return textOf(record['#text'])
  return ''
}

/** Collects the text of an inline-string cell, concatenating its rich-text runs. */
function inlineText(is: unknown): string {
  if (is == null) return ''
  const node = is as Record<string, unknown>
  // <is><t>plain</t></is>
  if ('t' in node) return textOf(node.t)
  // <is><r><t>run</t></r><r><t>run</t></r></is>
  if ('r' in node) {
    const runs = Array.isArray(node.r) ? node.r : [node.r]
    return runs.map((run) => textOf((run as Record<string, unknown>)?.t)).join('')
  }
  return ''
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Keep everything as written; number coercion is our job, not the parser's.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
})

/** A node of the parsed XML tree. The shape is untrusted, so nothing is assumed. */
type XmlNode = Record<string, unknown>

function asNode(value: unknown): XmlNode {
  return typeof value === 'object' && value !== null ? (value as XmlNode) : {}
}

function child(node: unknown, key: string): unknown {
  return asNode(node)[key]
}

function attr(node: unknown, name: string): string | undefined {
  const value = asNode(node)[name]
  return typeof value === 'string' ? value : undefined
}

function toArray(value: unknown): unknown[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  const items = child(child(parser.parse(xml), 'sst'), 'si')
  return toArray(items).map(inlineText)
}

function readCell(raw: unknown, shared: string[]): Cell {
  const type = attr(raw, '@_t')

  if (type === 'inlineStr') {
    const text = inlineText(child(raw, 'is'))
    return text === '' ? EMPTY_CELL : { text, kind: 'text' }
  }

  const value = textOf(child(raw, 'v'))
  if (value === '') return EMPTY_CELL

  if (type === 's') {
    const text = shared[Number(value)] ?? ''
    return text === '' ? EMPTY_CELL : { text, kind: 'text' }
  }
  if (type === 'str' || type === 'e') {
    return { text: value, kind: 'text' }
  }
  if (type === 'b') {
    return { text: value === '1' ? 'TRUE' : 'FALSE', kind: 'text' }
  }

  // No type attribute means a number.
  const number = Number(value)
  if (Number.isNaN(number)) return { text: value, kind: 'text' }
  return { text: value, kind: 'number', number }
}

function parseMerges(sheet: unknown): MergeRange[] {
  return toArray(child(child(sheet, 'mergeCells'), 'mergeCell')).flatMap((merge) => {
    const ref = attr(merge, '@_ref')
    if (ref === undefined || !ref.includes(':')) return []
    const [from, to] = ref.split(':')
    const a = parseCellRef(from)
    const b = parseCellRef(to)
    return [{ top: a.row, left: a.col, bottom: b.row, right: b.col }]
  })
}

/** Parses one worksheet XML document into a dense grid. */
export function parseSheetXml(xml: string, shared: string[] = [], name = 'Sheet1'): Sheet {
  const sheet = child(parser.parse(xml), 'worksheet')

  const cells: Array<{ row: number; col: number; cell: Cell }> = []
  let maxRow = -1
  let maxCol = -1

  for (const row of toArray(child(child(sheet, 'sheetData'), 'row'))) {
    const declaredRowRef = attr(row, '@_r')
    const declaredRow = declaredRowRef ? Number(declaredRowRef) - 1 : undefined
    let cursor = 0
    for (const raw of toArray(child(row, 'c'))) {
      const ref = attr(raw, '@_r')
      const position = ref
        ? parseCellRef(ref)
        : { row: declaredRow ?? maxRow + 1, col: cursor }
      cursor = position.col + 1

      const cell = readCell(raw, shared)
      if (cell.kind === 'empty') continue

      cells.push({ ...position, cell })
      if (position.row > maxRow) maxRow = position.row
      if (position.col > maxCol) maxCol = position.col
    }
  }

  const rows: Cell[][] = Array.from({ length: maxRow + 1 }, () =>
    Array.from({ length: maxCol + 1 }, () => EMPTY_CELL),
  )
  for (const { row, col, cell } of cells) rows[row][col] = cell

  return { name, rows, merges: parseMerges(sheet) }
}

/** Unzips a workbook and returns its first worksheet as a dense grid. */
/** Only these parts are ever read, so nothing else is decompressed. */
const WANTED_PART = /^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml)$/

/**
 * Largest single part accepted after decompression.
 *
 * A real statement sheet runs a few hundred kilobytes. This ceiling exists for
 * the archive that is small on disk and enormous once expanded, which would
 * otherwise exhaust memory before any of our code ran.
 */
export const MAX_PART_BYTES = 32 * 1024 * 1024

export interface ReadOptions {
  maxPartBytes?: number
}

export function readXlsx(data: Uint8Array, options: ReadOptions = {}): Sheet {
  const limit = options.maxPartBytes ?? MAX_PART_BYTES

  /*
    Two guards, applied before anything is decompressed.

    The filter means a part we never read is never expanded, and the size check
    rejects a small archive that claims to expand into something enormous. The
    declared size comes from the archive's own directory and an attacker can lie
    in it, but fflate sizes its output buffer from that declaration and fails
    when the stream overruns it, so a lie is caught rather than believed.
  */
  const zip = unzipSync(data, {
    filter: (file) => {
      if (!WANTED_PART.test(file.name)) return false
      if (file.originalSize > limit) {
        throw new Error(
          `Workbook part ${file.name} expands to ${file.originalSize} bytes, over the ${limit} byte limit`,
        )
      }
      return true
    },
  })

  const sheetPath = Object.keys(zip)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
    .sort()[0]
  if (!sheetPath) throw new Error('Workbook contains no worksheet')

  const sharedPath = Object.keys(zip).find((path) => /sharedStrings\.xml$/.test(path))
  const shared = parseSharedStrings(sharedPath ? strFromU8(zip[sharedPath]) : undefined)

  return parseSheetXml(strFromU8(zip[sheetPath]), shared, sheetPath)
}

/** Reads a cell without bounds checking noise. */
export function cellAt(sheet: Sheet, row: number, col: number): Cell {
  return sheet.rows[row]?.[col] ?? EMPTY_CELL
}

/** All non-empty cell texts of a row, in column order. */
export function rowTexts(sheet: Sheet, row: number): string[] {
  return (sheet.rows[row] ?? []).map((cell) => cell.text)
}
