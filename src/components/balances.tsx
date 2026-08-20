import { Money } from '@/components/money'
import { formatJakarta } from '@/lib/datetime'
import type { AccountMovement, BankReconciliation, StalledAccount } from '@/lib/ledger/monthly'
import { formatIdr } from '@/lib/money'

/**
 * Where the money actually is, and how much of that the app can vouch for.
 *
 * This panel exists because the headline Sisa uang figure was believed and was
 * wrong. It was not wrong arithmetically: it was the sum of every account, and
 * every account balance followed correctly from the rows imported. It was wrong
 * because only the bank account has statements behind it. An e-wallet that was
 * topped up nine million Rupiah and never once spent from carries nine million
 * on this app's books and nothing like it in real life.
 *
 * So the total is shown split rather than whole: what the bank confirms, and
 * what is only inferred. A single number could not have said that, and a single
 * number is what caused the problem.
 */

interface Props {
  movements: AccountMovement[]
  reconciliation: BankReconciliation | null
  stalled: StalledAccount[]
  statementDate: Date | null
}

export function Balances({ movements, reconciliation, stalled, statementDate }: Props) {
  const stalledIds = new Set(stalled.map((account) => account.accountId))
  const confirmed = reconciliation?.computed ?? 0n
  const inferred = movements
    .filter((account) => account.accountId !== reconciliation?.accountId)
    .reduce((sum, account) => sum + account.closing, 0n)

  return (
    <div className="space-y-4">
      {reconciliation ? (
        <div
          className={`border p-4 ${
            reconciliation.ok ? 'border-under/40 bg-under-wash' : 'border-over/40 bg-over-wash'
          }`}
        >
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <span aria-hidden="true" className={reconciliation.ok ? 'text-under' : 'text-over'}>
              {reconciliation.ok ? '●' : '▲'}
            </span>
            {reconciliation.ok
              ? 'Saldo Bank Mandiri di app cocok dengan yang dicetak bank'
              : 'Saldo Bank Mandiri di app tidak cocok dengan yang dicetak bank'}
          </p>
          <p className="mt-1.5 text-sm text-ink-muted">
            App menghitung{' '}
            <span className="tnum font-mono text-ink">{formatIdr(reconciliation.computed)}</span>,
            bank mencetak{' '}
            <span className="tnum font-mono text-ink">{formatIdr(reconciliation.printed)}</span>
            {statementDate ? ` per ${formatJakarta(statementDate, 'date')}` : ''}
            {reconciliation.ok
              ? '. Ini satu-satunya angka di halaman ini yang dicek terhadap sumber di luar app, jadi ia yang paling bisa dipegang.'
              : `. Selisihnya ${formatIdr(reconciliation.difference)}, yang berarti ada baris yang belum masuk atau salah terbaca.`}
          </p>
        </div>
      ) : null}

      {stalled.length > 0 ? (
        <div className="border border-warn/40 bg-warn-wash p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <span aria-hidden="true" className="text-warn">
              ◆
            </span>
            Ada saldo yang kelihatannya ada, padahal kemungkinan besar sudah terpakai
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">
            {stalled.map((account) => (
              <li key={account.accountId}>
                <span className="text-ink">{account.name}</span> menerima{' '}
                <Money sen={account.credit} /> dan hampir tidak pernah mengeluarkan apa pun, jadi{' '}
                <Money sen={account.stranded} /> tercatat masih ada di sana.
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-muted">
            E-statement Mandiri hanya merekam sisi keluarnya, yaitu saat kamu top-up. Belanja dari
            e-wallet tidak pernah lewat Mandiri, jadi app tidak bisa melihatnya. Sampai kanal
            pencatatan e-wallet ada, angka ini terhitung di Sisa uang padahal uangnya sudah habis.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Split
          label="Dipastikan bank"
          sen={confirmed}
          hint="Rekening yang punya e-statement di belakangnya."
        />
        <Split
          label="Hanya perkiraan"
          sen={inferred}
          hint="Akun tanpa statement. Dihitung dari uang yang masuk, bukan dari yang tersisa."
          uncertain
        />
      </div>

      <div
        className="overflow-x-auto border border-line bg-surface"
        tabIndex={0}
        role="region"
        aria-label="Tabel saldo per akun, bisa digeser ke samping"
      >
        <table className="w-full text-sm">
          <caption className="sr-only">Saldo tiap akun, dari saldo awal ditambah masuk dikurangi keluar</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th scope="col" className="px-4 py-2.5 font-medium">
                Akun
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Masuk
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Keluar
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Saldo
              </th>
            </tr>
          </thead>
          <tbody>
            {movements.map((account) => (
              <tr key={account.accountId} className="border-b border-line last:border-0">
                <th scope="row" className="whitespace-nowrap px-4 py-2.5 text-left font-normal text-ink">
                  {stalledIds.has(account.accountId) ? (
                    <span aria-hidden="true" className="mr-1.5 text-warn">
                      ◆
                    </span>
                  ) : null}
                  {account.name}
                </th>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tnum font-mono text-ink-muted">
                  {account.credit === 0n ? '—' : formatIdr(account.credit)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tnum font-mono text-ink-muted">
                  {account.debit === 0n ? '—' : formatIdr(account.debit)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tnum font-mono text-ink">
                  {formatIdr(account.closing)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Split({
  label,
  sen,
  hint,
  uncertain = false,
}: {
  label: string
  sen: bigint
  hint: string
  uncertain?: boolean
}) {
  return (
    <div className="border border-line bg-surface p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
        {uncertain ? (
          <span aria-hidden="true" className="text-warn">
            ◆
          </span>
        ) : null}
        {label}
      </p>
      <p className="mt-1.5 tnum font-mono text-lg text-ink">{formatIdr(sen)}</p>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </div>
  )
}
