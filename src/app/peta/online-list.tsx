import { HOME_COUNTRY, type OnlineReport, type OnlineRecipient } from '@/lib/ledger/online'
import { formatIdr } from '@/lib/money'
import { share } from './view-model'

/**
 * "Uang online ke mana": the money the map cannot draw, by who was paid and
 * where that company bills from. A list rather than points on a world map,
 * so the map stays a map of places the household actually went.
 */

const FIRST_ROWS = 10

function Row({ recipient }: { recipient: OnlineRecipient }) {
  const { biller } = recipient
  const where = !biller
    ? 'Negara penagih tidak diketahui'
    : biller.city === biller.country
      ? biller.country
      : `${biller.city}, ${biller.country}`
  return (
    <li className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-subhead text-ink">{recipient.label}</span>
        <span className="tnum shrink-0 font-mono text-subhead text-ink">{formatIdr(recipient.total)}</span>
      </div>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-footnote text-ink-muted">
        <span className={biller && biller.country !== HOME_COUNTRY ? 'text-ink' : undefined}>{where}</span>
        <span aria-hidden="true" className="text-ink-faint">
          ·
        </span>
        <span>{recipient.payments} kali</span>
        {biller?.gateway ? (
          <>
            <span aria-hidden="true" className="text-ink-faint">
              ·
            </span>
            <span>payment gateway, tokonya tidak tertulis di mutasi</span>
          </>
        ) : null}
      </p>
    </li>
  )
}

export function OnlineList({ report }: { report: OnlineReport }) {
  const abroad = report.recipients.filter((r) => r.biller && r.biller.country !== HOME_COUNTRY)
  const first = report.recipients.slice(0, FIRST_ROWS)
  const rest = report.recipients.slice(FIRST_ROWS)

  return (
    <section aria-labelledby="uang-online" className="space-y-3">
      <div>
        <h2 id="uang-online" className="text-subhead font-medium text-ink">
          Uang online ke mana
        </h2>
        <p className="mt-1 text-subhead text-ink-muted">
          {report.total === 0n ? (
            'Tidak ada belanja atau tagihan online di pilihan ini.'
          ) : (
            <>
              <span className="tnum font-mono text-ink">{formatIdr(report.total)}</span> dibayar ke toko dan tagihan
              online yang tidak punya tempat di peta.
              {report.abroad > 0n ? (
                <>
                  {' '}
                  {share(report.abroad, report.total)}% di antaranya ke luar negeri, ke{' '}
                  {abroad.map((r) => r.biller!.company).join(', ')}.
                </>
              ) : null}
            </>
          )}
        </p>
      </div>

      {first.length > 0 ? (
        <ul aria-label="Penerima uang online" className="squircle rows-inset rounded-md bg-surface shadow-xs">
          {first.map((recipient) => (
            <Row key={recipient.key} recipient={recipient} />
          ))}
        </ul>
      ) : null}

      {rest.length > 0 ? (
        <details className="squircle rounded-md bg-surface shadow-xs">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-subhead text-accent">
            {rest.length} penerima lainnya
          </summary>
          <ul className="rows-inset border-t border-line">
            {rest.map((recipient) => (
              <Row key={recipient.key} recipient={recipient} />
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-footnote text-ink-faint">
        Negara adalah tempat perusahaan menagih, bukan tempat barangnya dikirim: Google menagih Indonesia dari
        Singapura. Transfer ke orang, biaya bank, dan kiriman GoPay ke nomor HP tidak dihitung di sini.
      </p>
    </section>
  )
}
