import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { SummaryLine } from '@/lib/ledger/summary'
import type { SummaryData } from '../data'
import { cell, money, monthShort, period } from '../format'

/**
 * The summary as one A4 page, from the same `SummaryData` as the screen.
 *
 * Its own layout rather than a picture of the page: a phone column printed on
 * A4 wastes two thirds of the sheet, and here the label can sit beside its
 * four figures the way it cannot at 390px. Same sections, same order, same
 * numbers.
 *
 * The built-in Helvetica has no true minus sign, so the PDF writes a hyphen.
 */

const plain = (text: string) => text.replace(/−/g, '-')

const INK = '#1c1c1e'
const MUTED = '#6c6c70'
const LINE = '#d1d1d6'
const OVER = '#c4312a'
const UNDER = '#1f7a5c'

const styles = StyleSheet.create({
  page: { paddingVertical: 30, paddingHorizontal: 40, fontFamily: 'Helvetica', fontSize: 9.5, color: INK },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  meta: { fontSize: 10, color: MUTED, marginTop: 3 },
  section: { marginTop: 11 },
  heading: { fontSize: 11.5, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  row: { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: LINE },
  head: { flexDirection: 'row', paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: LINE, color: MUTED },
  total: { flexDirection: 'row', paddingVertical: 3, fontFamily: 'Helvetica-Bold' },
  label: { flex: 2.4 },
  figure: { flex: 1, textAlign: 'right' },
  note: { fontSize: 8.5, color: MUTED, marginTop: 3, lineHeight: 1.3 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderWidth: 0.5, borderColor: LINE, borderRadius: 4, padding: 6 },
  tileValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  columns: { flexDirection: 'row', gap: 20 },
  column: { flex: 1 },
  pot: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: LINE },
  plan: { borderWidth: 0.5, borderColor: LINE, borderRadius: 4, padding: 6, fontSize: 9, lineHeight: 1.35 },
})

function Table({ months, rows, total }: { months: string[]; rows: SummaryLine[]; total: SummaryLine }) {
  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.label}> </Text>
        {months.map((month) => (
          <Text key={month} style={styles.figure}>
            {monthShort(month)}
          </Text>
        ))}
        <Text style={styles.figure}>Rata-rata</Text>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          {row.values.map((value, position) => (
            <Text key={months[position]} style={styles.figure}>
              {plain(cell(value))}
            </Text>
          ))}
          <Text style={styles.figure}>{plain(cell(row.average))}</Text>
        </View>
      ))}
      <View style={styles.total}>
        <Text style={styles.label}>{total.label}</Text>
        {total.values.map((value, position) => (
          <Text key={months[position]} style={styles.figure}>
            {plain(cell(value))}
          </Text>
        ))}
        <Text style={styles.figure}>{plain(cell(total.average))}</Text>
      </View>
    </View>
  )
}

export function SummaryPdf({ data, printedAt }: { data: SummaryData; printedAt: string }) {
  const { report, pots, potsTotal, note } = data
  const incomeExcluded = report.excluded.filter((row) => row.side === 'income')
  const spendingExcluded = report.excluded.filter((row) => row.side === 'spending')
  const spendingRows =
    report.netted.average > 0n
      ? [
          ...report.spending,
          {
            label: `Dikurangi ${report.netted.label.toLowerCase()}`,
            values: report.netted.values.map((value) => -value),
            average: -report.netted.average,
          },
        ]
      : report.spending
  const tiles = [
    ...report.months.map((month, position) => ({ key: month, label: monthShort(month), value: report.remainder.values[position] })),
    { key: 'rata', label: 'Rata-rata', value: report.remainder.average },
  ]
  const list = (rows: { label: string; total: bigint }[]) =>
    rows.map((row) => `${row.label.toLowerCase()} (${plain(money(row.total))})`).join(', ') || 'tidak ada'

  return (
    <Document title={`Ringkasan 3 bulan, ${period(report.months)}`} author="FiFoFun">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Ringkasan 3 Bulan</Text>
        <Text style={styles.meta}>
          {period(report.months)} · semua angka dalam rupiah (Rp) · dicetak {printedAt}
        </Text>

        <View style={styles.section}>
          <Text style={styles.heading}>Pemasukan</Text>
          <Table months={report.months} rows={report.income} total={report.incomeTotal} />
          <Text style={styles.note}>
            Tidak dihitung sebagai pemasukan: {list(incomeExcluded)}. Uang itu bukan hasil kerja dan tidak bisa diandalkan
            tiap bulan.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Pengeluaran</Text>
          <Table months={report.months} rows={spendingRows} total={report.spendingTotal} />
          <Text style={styles.note}>
            {report.netted.average > 0n ? `${report.netted.label} mengurangi pengeluaran, karena belanjanya sudah tercatat. ` : ''}
            {report.unitemised
              ? `${report.unitemised}: isi ulang dompet dan tunai dihitung keluar di bulan diisi, karena isinya tidak dicatat satu per satu. `
              : ''}
            {report.amortised.join(', ')} dibagi rata per 12 bulan. Tidak dihitung: {list(spendingExcluded)}.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Sisa</Text>
          <View style={styles.tiles}>
            {tiles.map((tile) => (
              <View key={tile.key} style={styles.tile}>
                <Text style={{ color: MUTED }}>{tile.label}</Text>
                <Text style={[styles.tileValue, { color: tile.value < 0n ? OVER : tile.value > 0n ? UNDER : INK }]}>
                  {plain(money(tile.value))}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Side by side: A4 has the width a phone does not, and a long plan stays on the one page. */}
        <View style={[styles.section, styles.columns]}>
          <View style={styles.column}>
            <Text style={styles.heading}>Tabungan saat ini</Text>
            {pots.map((pot) => (
              <View key={pot.name} style={styles.pot}>
                <Text>{pot.name}</Text>
                <Text>{plain(money(pot.saved))}</Text>
              </View>
            ))}
            <View style={[styles.pot, { borderBottomWidth: 0 }]}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>Total</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{plain(money(potsTotal))}</Text>
            </View>
          </View>
          <View style={styles.column}>
            <Text style={styles.heading}>Rencana</Text>
            <Text style={[styles.plan, note.length > 600 ? { fontSize: 8 } : {}]}>{note || 'Belum ditulis.'}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
