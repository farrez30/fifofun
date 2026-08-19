import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { MAX_PART_BYTES, cellAt, columnToIndex, parseCellRef, parseSheetXml, readXlsx } from './index'

/**
 * The reader parses files that arrive from outside the application, so the
 * tests here are as much about what it refuses as about what it reads.
 */

function workbook(sheetXml: string, extra: Record<string, string> = {}) {
  const parts: Record<string, Uint8Array> = {
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  }
  for (const [path, content] of Object.entries(extra)) parts[path] = strToU8(content)
  return zipSync(parts)
}

const SIMPLE = `<worksheet><sheetData>
  <row r="1"><c r="A1" t="inlineStr"><is><t>Tanggal</t></is></c><c r="C1" t="inlineStr"><is><t>Saldo</t></is></c></row>
  <row r="2"><c r="A2" t="inlineStr"><is><t>01 Mar 2026</t></is></c><c r="C2"><v>1552574.5</v></c></row>
</sheetData></worksheet>`

describe('columnToIndex', () => {
  it('maps single letters', () => {
    expect(columnToIndex('A')).toBe(0)
    expect(columnToIndex('Z')).toBe(25)
  })

  it('maps two-letter columns', () => {
    expect(columnToIndex('AA')).toBe(26)
    expect(columnToIndex('AZ')).toBe(51)
    expect(columnToIndex('BA')).toBe(52)
  })
})

describe('parseCellRef', () => {
  it('splits a reference into zero-based coordinates', () => {
    expect(parseCellRef('A1')).toEqual({ row: 0, col: 0 })
    expect(parseCellRef('C15')).toEqual({ row: 14, col: 2 })
    expect(parseCellRef('AA100')).toEqual({ row: 99, col: 26 })
  })
})

describe('parseSheetXml', () => {
  it('keeps cells at their declared coordinates, gaps and all', () => {
    const sheet = parseSheetXml(SIMPLE)
    expect(cellAt(sheet, 0, 0).text).toBe('Tanggal')
    // Column B is absent from the XML entirely and must still be addressable.
    expect(cellAt(sheet, 0, 1).kind).toBe('empty')
    expect(cellAt(sheet, 0, 2).text).toBe('Saldo')
  })

  it('separates a stored number from stored text', () => {
    const sheet = parseSheetXml(SIMPLE)
    expect(cellAt(sheet, 1, 2).kind).toBe('number')
    expect(cellAt(sheet, 1, 2).number).toBe(1552574.5)
    expect(cellAt(sheet, 1, 0).kind).toBe('text')
  })

  it('joins rich-text runs into one string', () => {
    // Real Mandiri statements store every label this way, split across runs.
    const rich = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is>
      <r><t>Dana </t></r><r><t>Masuk</t></r>
    </is></c></row></sheetData></worksheet>`
    expect(cellAt(parseSheetXml(rich), 0, 0).text).toBe('Dana Masuk')
  })

  it('preserves newlines inside a cell', () => {
    // The Keterangan column carries real newlines that separate the merchant
    // from the reference, and flattening them loses the separator.
    const withBreak = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Transfer\nke BUDI</t></is></c></row></sheetData></worksheet>`
    expect(cellAt(parseSheetXml(withBreak), 0, 0).text).toContain('\n')
  })

  it('reads shared strings when a cell points at one', () => {
    const xml = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>1</v></c></row></sheetData></worksheet>`
    expect(cellAt(parseSheetXml(xml, ['nol', 'satu']), 0, 0).text).toBe('satu')
  })

  it('returns an empty sheet rather than throwing on no rows', () => {
    const sheet = parseSheetXml('<worksheet><sheetData/></worksheet>')
    expect(sheet.rows).toEqual([])
  })
})

describe('readXlsx', () => {
  it('reads a workbook end to end', () => {
    const sheet = readXlsx(workbook(SIMPLE))
    expect(cellAt(sheet, 0, 0).text).toBe('Tanggal')
  })

  it('refuses an archive with no worksheet', () => {
    const noSheet = zipSync({ 'xl/sharedStrings.xml': strToU8('<sst/>') })
    expect(() => readXlsx(noSheet)).toThrow(/no worksheet/)
  })

  it('refuses anything that is not a zip at all', () => {
    expect(() => readXlsx(strToU8('this is a text file, not a workbook'))).toThrow()
  })

  it('refuses a truncated archive rather than returning half a sheet', () => {
    const whole = workbook(SIMPLE)
    expect(() => readXlsx(whole.slice(0, Math.floor(whole.length / 2)))).toThrow()
  })

  describe('decompression limit', () => {
    /*
      A zip bomb is small on disk and enormous once expanded. Without a ceiling
      the expansion happens before any of our code runs, so the check has to sit
      in the filter, ahead of decompression.
    */
    const bomb = workbook('<x/>'.repeat(600_000))

    it('is small compressed and large expanded, which is the whole problem', () => {
      expect(bomb.length).toBeLessThan(10_000)
    })

    it('refuses a part that expands past the limit', () => {
      expect(() => readXlsx(bomb, { maxPartBytes: 1024 })).toThrow(/over the 1024 byte limit/)
    })

    it('is a ceiling rather than a blanket refusal', () => {
      expect(() => readXlsx(bomb, { maxPartBytes: MAX_PART_BYTES })).not.toThrow()
    })

    it('never expands a part it does not read', () => {
      // An enormous part outside the two paths we read must not be touched, so
      // its size cannot trip the limit.
      const withPayload = zipSync({
        'xl/worksheets/sheet1.xml': strToU8(SIMPLE),
        'xl/media/image1.png': strToU8('x'.repeat(2_000_000)),
      })
      expect(() => readXlsx(withPayload, { maxPartBytes: 1_000_000 })).not.toThrow()
    })
  })
})
