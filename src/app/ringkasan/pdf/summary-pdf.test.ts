import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { summariseMonths } from '@/lib/ledger/summary'
import type { SummaryData } from '../data'
import { SummaryPdf } from './summary-pdf'

/**
 * The shared file has to be what the spec promised: a PDF, one A4 page, even
 * with every section full.
 */

const at = (day: string) => new Date(`${day}T05:00:00Z`)
const row = (cashflow: string, categoryName: string, rupiah: number, day: string) => ({
  id: `${categoryName}-${day}`,
  occurredAt: at(day),
  description: categoryName,
  amount: BigInt(rupiah) * 100n,
  cashflow: cashflow as never,
  categoryId: null,
  fromAccountId: null,
  toAccountId: null,
  source: 'xlsx' as const,
  categoryName,
})

const report = summariseMonths(
  [
    row('income', 'Gaji', 6_300_000, '2026-07-27'),
    row('income', 'Gaji', 6_120_000, '2026-08-27'),
    row('income', 'Gaji', 6_670_000, '2026-09-28'),
    row('income', 'Penggantian Keluarga', 304_000, '2026-08-30'),
    row('income', 'Transfer Keluarga', 300_000, '2026-08-16'),
    row('spending', 'Kos & Sewa', 1_500_000, '2026-07-01'),
    row('spending', 'Dating', 1_581_448, '2026-08-02'),
    row('sinking_fund', 'Pajak Kendaraan', 992_000, '2026-07-14'),
  ],
  ['2026-07', '2026-08', '2026-09'],
)

const data: SummaryData = {
  report,
  pots: ['Dana Darurat', 'Dana Menikah', 'Dana Rumah', 'Dana Mobil', 'Tabungan', 'Reksadana', 'Pajak Kendaraan'].map((name) => ({
    name,
    saved: 0n,
  })),
  potsTotal: 0n,
  note: 'Mulai Okt: nabung 1 jt/bln.\nDD 2 bln dulu, lalu nikah.\n'.repeat(4),
  end: '2026-09',
  choices: ['2026-09'],
}

describe('SummaryPdf', () => {
  it('renders one A4 page', async () => {
    const buffer = await renderToBuffer(createElement(SummaryPdf, { data, printedAt: '02 Okt 2026' }) as never)
    const text = buffer.toString('latin1')
    expect(text.startsWith('%PDF')).toBe(true)
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1)
    // A4 in points.
    expect(text).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/)
  })

  it('stays on one page with the longest plan the form allows', async () => {
    const longest = Array.from({ length: 25 }, (_, line) => `Baris ${line + 1}: nabung dan catat semuanya.`)
      .join(String.fromCharCode(10))
      .slice(0, 1000)
    const buffer = await renderToBuffer(
      createElement(SummaryPdf, { data: { ...data, note: longest }, printedAt: '02 Okt 2026' }) as never,
    )
    expect(buffer.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1)
  })
})
