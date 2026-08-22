import { BalanceRows } from '@/app/catat/adjust-balance'
import { formatJakarta } from '@/lib/datetime'
import type { AccountMovement, BankReconciliation, StalledAccount } from '@/lib/ledger/monthly'
import type { AccountKind } from '@/lib/ledger/types'
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
  /** Kind per account, for the mark beside each name. */
  accounts: { id: string; kind: AccountKind }[]
  /** Today in Jakarta, as the adjustment form's date input wants it. */
  today: string
  /** One per row, so a double submit of a correction writes once. */
  entryKeys: Record<string, string>
}

export function Balances({
  movements,
  reconciliation,
  stalled,
  statementDate,
  accounts,
  today,
  entryKeys,
}: Props) {
  const stalledIds = new Set(stalled.map((account) => account.accountId))
  const kinds = new Map(accounts.map((account) => [account.id, account.kind]))
  const bankName =
    movements.find((movement) => movement.accountId === reconciliation?.accountId)?.name ??
    'rekening bank'
  const stranded = stalled.reduce((sum, account) => sum + account.stranded, 0n)
  const confirmed = reconciliation?.computed ?? 0n
  const inferred = movements
    .filter((account) => account.accountId !== reconciliation?.accountId)
    .reduce((sum, account) => sum + account.closing, 0n)

  return (
    <div className="space-y-4">
      {/* The split comes first because it is the answer. Everything below is
          the evidence for one half and the explanation for the other. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Split
          label="Dipastikan bank"
          sen={confirmed}
          hint="Rekening yang punya e-statement di belakangnya."
        />
        <Split
          label="Hanya perkiraan"
          sen={inferred}
          hint={
            stranded > 0n
              ? `Akun tanpa statement. Termasuk ${formatIdr(stranded)} yang hampir pasti sudah terpakai.`
              : 'Akun tanpa statement. Dihitung dari uang yang masuk, bukan dari yang tersisa.'
          }
        />
      </div>

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
            Saldo {bankName} {reconciliation.ok ? 'cocok' : 'tidak cocok'} dengan yang dicetak bank
          </p>

          {/* Two labelled figures rather than one sentence containing both. The
              comparison is the point, and a reader can only compare two numbers
              they can see at once. */}
          <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-muted">App menghitung</dt>
              <dd className="tnum font-mono text-ink">{formatIdr(reconciliation.computed)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-muted">
                Bank mencetak
                {statementDate ? ` · ${formatJakarta(statementDate, 'date')}` : ''}
              </dt>
              <dd className="tnum font-mono text-ink">{formatIdr(reconciliation.printed)}</dd>
            </div>
            {reconciliation.ok ? null : (
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">Selisih</dt>
                <dd className="tnum font-mono text-over">
                  {formatIdr(reconciliation.difference)}
                </dd>
              </div>
            )}
          </dl>

          <p className="mt-3 text-xs text-ink-muted">
            {reconciliation.ok
              ? 'Satu-satunya angka di halaman ini yang dicek ke sumber di luar app.'
              : 'Ada baris yang belum masuk atau salah terbaca.'}
          </p>
        </div>
      ) : null}

      {stalled.length > 0 ? (
        <div className="border border-warn/40 bg-warn-wash p-4">
          <p className="flex items-baseline gap-2 text-sm font-medium text-ink">
            <span aria-hidden="true" className="text-warn">
              ◆
            </span>
            <span>
              <span className="tnum font-mono">{formatIdr(stranded)}</span> tercatat ada,
              kemungkinan besar sudah terpakai
            </span>
          </p>

          <p className="mt-2 text-sm text-ink-muted">
            {stalled.length} akun menerima uang dan hampir tidak pernah mengeluarkannya:{' '}
            <span className="text-ink">
              {stalled.map((account) => account.name).join(', ')}
            </span>
            .
          </p>

          <p className="mt-2 text-sm text-ink-muted">
            E-statement Mandiri hanya merekam saat kamu top-up. Belanja dari e-wallet tidak lewat
            Mandiri, jadi app tidak bisa melihatnya.
          </p>

          <p className="mt-2 text-xs text-ink-muted">
            Nominal per akun ada di tabel bawah, ditandai ◆. Kalau kamu tahu saldo sebenarnya,
            Sesuaikan saldo mencatat selisihnya sebagai transaksi.
          </p>
        </div>
      ) : null}

      <div
        className="relative overflow-x-auto border border-line bg-surface"
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
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Penyesuaian
              </th>
            </tr>
          </thead>
          {/* The rows are a client island so a correction can be typed in
              place. Everything above stays on the server, where the bigint
              arithmetic and the reconciliation live. */}
          <BalanceRows
            rows={movements.map((account) => ({
              accountId: account.accountId,
              name: account.name,
              kind: kinds.get(account.accountId) ?? 'cash',
              stalled: stalledIds.has(account.accountId),
              credit: formatIdr(account.credit),
              debit: formatIdr(account.debit),
              closing: formatIdr(account.closing),
              closingSen: account.closing.toString(),
              reconciled: account.accountId === reconciliation?.accountId,
              today,
              entryKey: entryKeys[account.accountId] ?? account.accountId,
            }))}
          />
        </table>
      </div>
    </div>
  )
}

function Split({ label, sen, hint }: { label: string; sen: bigint; hint: string }) {
  return (
    <div className="border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-1.5 tnum font-mono text-lg text-ink">{formatIdr(sen)}</p>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </div>
  )
}
