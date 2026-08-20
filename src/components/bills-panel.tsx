import type { BillsReview, BillState } from '@/lib/ledger/bills'
import { formatIdr } from '@/lib/money'

/**
 * Which bills are settled this month, and what the rest will cost.
 *
 * The spreadsheet keeps a Paid or Unpaid typed in by hand next to each bill.
 * Nothing here is typed in: the state is read from whether money actually left
 * for that category this month, so a bill cannot be marked paid in a month where
 * nothing moved. See `lib/ledger/bills`.
 */

const STATE: Record<BillState, { glyph: string; text: string; label: string }> = {
  paid: { glyph: '●', text: 'text-under', label: 'Sudah dibayar' },
  due: { glyph: '▲', text: 'text-warn', label: 'Belum dibayar' },
  dormant: { glyph: '○', text: 'text-ink-faint', label: 'Lama tidak muncul' },
}

interface Props {
  review: BillsReview
}

export function BillsPanel({ review }: Props) {
  const { bills, due, total, outstanding } = review

  if (bills.length === 0) {
    return (
      <div className="border border-line bg-surface p-6">
        <p className="text-sm font-medium text-ink">Belum ada tagihan yang tercatat.</p>
        <p className="mt-2 text-sm text-ink-muted">
          Impor tidak bisa menebak mana pembayaran yang berupa tagihan rutin. Listrik, internet,
          dan langganan biasanya mendarat di Belanja sampai ada yang memutuskan sebaliknya.
        </p>
        <a
          href="/tinjau"
          className="mt-3 inline-block text-sm text-accent underline underline-offset-2"
        >
          Pindahkan lewat antrean tinjau
        </a>
      </div>
    )
  }

  return (
    <div className="border border-line bg-surface">
      <div className="border-b border-line p-4">
        {/*
          Three cases, not two. A month with nothing due because everything was
          paid and a month with nothing due because no bill has been recorded in
          months are opposite situations, and the first version of this line
          reported the second one as "semua tagihan sudah dibayar, Rp0".
        */}
        <p className="text-sm font-medium text-ink">
          {due.length > 0
            ? `${due.length} tagihan belum dibayar, kira-kira ${formatIdr(outstanding)}.`
            : total > 0n
              ? `Semua tagihan bulan ini sudah dibayar, ${formatIdr(total)}.`
              : 'Belum ada tagihan yang tercatat keluar bulan ini.'}
        </p>

        <p className="mt-1 text-sm text-ink-muted">
          {due.length > 0 ? (
            `Sudah keluar bulan ini ${formatIdr(total)}.`
          ) : total > 0n ? (
            `${bills.filter((bill) => bill.state === 'paid').length} dari ${bills.length} tagihan aktif.`
          ) : (
            <>
              Listrik, internet, dan langganan biasanya mendarat di Belanja sampai ada yang
              memindahkannya.{' '}
              <a href="/tinjau" className="text-accent underline underline-offset-2">
                Pindahkan lewat antrean tinjau
              </a>
              .
            </>
          )}
        </p>
      </div>

      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Tabel tagihan, bisa digeser ke samping"
      >
        <table className="w-full min-w-lg border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th scope="col" className="px-4 py-2 font-medium">
                Tagihan
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Bulan ini
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Biasanya
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Dari
              </th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => {
              const style = STATE[bill.state]
              return (
                <tr key={bill.category} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-ink">
                    {bill.category}
                  </th>
                  <td className="px-4 py-2.5">
                    <span className={`flex items-center gap-1.5 ${style.text}`}>
                      <span aria-hidden="true">{style.glyph}</span>
                      <span className="text-ink-muted">{style.label}</span>
                    </span>
                  </td>
                  <td className="tnum px-4 py-2.5 text-right font-mono text-ink">
                    {bill.paid > 0n ? formatIdr(bill.paid) : <span className="text-ink-faint">–</span>}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right font-mono text-ink-muted">
                    {bill.usual > 0n ? (
                      formatIdr(bill.usual)
                    ) : (
                      <span className="text-ink-faint">belum diketahui</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">
                    {bill.account ?? <span className="text-ink-faint">–</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line p-4 text-xs text-ink-muted">
        Statusnya dibaca dari catatan, bukan dicentang sendiri: sebuah tagihan disebut sudah
        dibayar kalau ada uang yang benar-benar keluar untuk kategori itu bulan ini. Kolom
        biasanya adalah median dari bulan-bulan tagihan itu dibayar.
      </p>
    </div>
  )
}
