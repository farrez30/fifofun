import type { ReceivableReview, ReceivableState } from '@/lib/ledger/receivables'
import { formatIdr } from '@/lib/money'

/**
 * Money lent out and not yet back.
 *
 * The spreadsheet writes the state into the name, so a debt settled in March is
 * still called NOT PAID in December. Here the name is only a name and the state
 * comes from the two entries. See `lib/ledger/receivables`.
 */

const STATE: Record<ReceivableState, { glyph: string; text: string; label: string }> = {
  outstanding: { glyph: '▲', text: 'text-warn', label: 'Belum kembali' },
  partial: { glyph: '◆', text: 'text-warn', label: 'Baru sebagian' },
  settled: { glyph: '●', text: 'text-under', label: 'Lunas' },
  overpaid: { glyph: '■', text: 'text-over', label: 'Kelebihan bayar' },
}

interface Props {
  review: ReceivableReview
  /** Beyond this many days a debt is called out as going quiet. */
  staleAfter?: number
}

export function ReceivablesPanel({ review, staleAfter = 30 }: Props) {
  const { receivables, open, stale, outstanding, lent, returned } = review

  if (receivables.length === 0) {
    return (
      <div className="border border-line bg-surface p-6">
        <p className="text-sm text-ink">Tidak ada piutang yang tercatat.</p>
        <p className="mt-2 text-sm text-ink-muted">
          Catat uang yang kamu talangi sebagai Piutang Baru, dan pelunasannya sebagai Piutang
          Cair dengan nama kategori yang sama. Sisanya dihitung sendiri.
        </p>
      </div>
    )
  }

  return (
    <div className="border border-line bg-surface">
      <div className="border-b border-line p-4">
        <p className="text-sm font-medium text-ink">
          {open.length === 0
            ? `Semua piutang sudah kembali, ${formatIdr(returned)}.`
            : `${formatIdr(outstanding)} masih di tangan orang lain, dari ${open.length} piutang.`}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Total ditalangi {formatIdr(lent)}, sudah kembali {formatIdr(returned)}.
        </p>
      </div>

      <ul className="divide-y divide-line">
        {receivables.map((item) => {
          const style = STATE[item.state]
          const quiet = item.outstanding > 0n && item.age > staleAfter
          return (
            <li key={item.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4">
              <span className={`shrink-0 ${style.text}`} aria-hidden="true">
                {style.glyph}
              </span>

              <span className="min-w-0 flex-1 text-sm text-ink">{item.name}</span>

              <span className="tnum shrink-0 font-mono text-sm text-ink">
                {item.outstanding > 0n ? formatIdr(item.outstanding) : formatIdr(item.lent)}
              </span>

              <span className="w-full text-xs text-ink-muted">
                {style.label}
                {item.state === 'partial'
                  ? `, ${formatIdr(item.returned)} dari ${formatIdr(item.lent)}`
                  : ''}
                {item.outstanding > 0n
                  ? ` · ${item.age} hari${quiet ? ', sudah lama diam' : ''}`
                  : item.settledOn
                    ? ` · selesai dalam ${item.age} hari`
                    : ''}
              </span>
            </li>
          )
        })}
      </ul>

      <p className="border-t border-line p-4 text-xs text-ink-muted">
        Sisa piutang dihitung dari selisih Piutang Baru dan Piutang Cair pada kategori yang sama,
        jadi nama tidak perlu diubah saat lunas.
        {stale.length > 0
          ? ` ${stale.length} piutang sudah lewat ${staleAfter} hari tanpa pelunasan.`
          : ''}
      </p>
    </div>
  )
}
