import { SignedMoney } from '@/components/money'
import { AccountMark, CashflowChip, DirectionMark } from '@/components/marks'
import { formatJakarta } from '@/lib/datetime'
import { directionOf, signedDirection } from '@/lib/ledger/direction'
import { SOURCE_LABELS, isBankFact } from '@/lib/ledger/edit'
import { formatIdr } from '@/lib/money'
import type { TransactionDetail } from '@/lib/queries/household'
import type { TableAccount } from '@/components/transaction-table'

/**
 * The row as it stands, before anything is changed about it.
 *
 * A server component holding bigint, so the figures never cross into the form
 * beside it as anything but the digits it posts. What it exists to say is
 * where the row came from: everything a person may and may not do to it
 * follows from that one fact, and a form whose fields are missing without
 * explanation reads as a broken page.
 */

export function EntrySummary({
  detail,
  accounts,
}: {
  detail: TransactionDetail
  accounts: TableAccount[]
}) {
  const { row, parent, fees } = detail
  const byId = new Map(accounts.map((account) => [account.id, account]))
  const from = row.fromAccountId ? byId.get(row.fromAccountId) : undefined
  const to = row.toAccountId ? byId.get(row.toAccountId) : undefined

  return (
    <section aria-labelledby="ringkasan" className="border border-line bg-surface p-4">
      <h2 id="ringkasan" className="sr-only">
        Transaksi ini
      </h2>

      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <DirectionMark direction={directionOf(row.cashflow)} className="translate-y-0.5" />
        <span className="text-base text-ink">{row.description}</span>
        <SignedMoney sen={row.amount} direction={signedDirection(row.cashflow)} />
      </p>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Pair label="Waktu">{formatJakarta(row.occurredAt, 'datetime')}</Pair>
        <Pair label="Akun">
          {from && to ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <AccountMark name={from.name} kind={from.kind} />
              <span aria-hidden="true">→</span>
              <span className="sr-only">ke</span>
              <AccountMark name={to.name} kind={to.kind} />
            </span>
          ) : from || to ? (
            <AccountMark name={(from ?? to)!.name} kind={(from ?? to)!.kind} />
          ) : (
            'Akun tidak dikenal'
          )}
        </Pair>
        <Pair label="Sumber">{SOURCE_LABELS[row.source]}</Pair>
        <Pair label="Jenis">
          <CashflowChip cashflow={row.cashflow} />
        </Pair>
        {parent ? (
          <Pair label="Bagian dari">
            <a
              href={`/transaksi/${parent.id}`}
              className="text-accent underline underline-offset-2"
            >
              {parent.description}
            </a>{' '}
            <span className="tnum font-mono text-ink-muted">{formatIdr(parent.amount)}</span>
          </Pair>
        ) : null}
        {fees.length > 0 ? (
          <Pair label="Biaya bank">
            {fees.length} baris, {formatIdr(fees.reduce((sum, fee) => sum + fee.amount, 0n))}
          </Pair>
        ) : null}
      </dl>

      {isBankFact(row.source) ? (
        <p className="mt-3 text-xs text-ink-muted">
          Nominal, tanggal, dan akun baris ini adalah fakta dari bank. Rekonsiliasi saldo
          bergantung padanya, jadi ketiganya tidak bisa diubah atau dihapus di sini. Kalau satu
          struk berisi beberapa kategori, pisahkan saja: jumlahnya tetap utuh.
        </p>
      ) : null}
    </section>
  )
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}
