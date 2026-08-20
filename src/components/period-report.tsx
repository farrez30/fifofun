import { formatJakarta } from '@/lib/datetime'
import type { PeriodFilter, PeriodSummary } from '@/lib/ledger/period'
import { CASHFLOW_LABELS, CASHFLOW_TYPES } from '@/lib/ledger/types'
import { formatIdr } from '@/lib/money'

/**
 * The filter form and its answer.
 *
 * A plain `GET` form, so the browser does the work: no client component, no
 * state to keep in sync with the address bar, and every filter survives a
 * reload. The submit button is real, because a form that applies itself on every
 * keystroke fires a request per letter typed into the search field.
 */

interface Props {
  summary: PeriodSummary
  filter: PeriodFilter
  /** The query string as it arrived, so the form can show what was asked for. */
  raw: Record<string, string | string[] | undefined>
  categories: string[]
  accounts: string[]
  ledgerSize: number
}

function value(raw: Props['raw'], key: string): string {
  const found = Array.isArray(raw[key]) ? raw[key][0] : raw[key]
  return found ?? ''
}

const FIELD =
  'mt-1 w-full rounded-sm border border-line bg-paper px-2.5 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

const LABEL = 'block text-xs font-medium uppercase tracking-wide text-ink-faint'

export function PeriodReport({ summary, raw, categories, accounts, ledgerSize }: Props) {
  const filtered =
    Boolean(value(raw, 'dari') || value(raw, 'sampai') || value(raw, 'cashflow')) ||
    Boolean(value(raw, 'kategori') || value(raw, 'akun') || value(raw, 'cari'))

  return (
    <div className="space-y-6">
      <form method="get" className="border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label>
            <span className={LABEL}>Dari tanggal</span>
            <input type="date" name="dari" defaultValue={value(raw, 'dari')} className={FIELD} />
          </label>

          <label>
            <span className={LABEL}>Sampai tanggal</span>
            <input
              type="date"
              name="sampai"
              defaultValue={value(raw, 'sampai')}
              className={FIELD}
            />
          </label>

          <label>
            <span className={LABEL}>Cashflow</span>
            <select name="cashflow" defaultValue={value(raw, 'cashflow')} className={FIELD}>
              <option value="">Semua</option>
              {CASHFLOW_TYPES.map((cashflow) => (
                <option key={cashflow} value={cashflow}>
                  {CASHFLOW_LABELS[cashflow]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className={LABEL}>Kategori</span>
            <select name="kategori" defaultValue={value(raw, 'kategori')} className={FIELD}>
              <option value="">Semua</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className={LABEL}>Akun</span>
            <select name="akun" defaultValue={value(raw, 'akun')} className={FIELD}>
              <option value="">Semua</option>
              {accounts.map((account) => (
                <option key={account} value={account}>
                  {account}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className={LABEL}>Cari keterangan</span>
            <input
              type="search"
              name="cari"
              maxLength={100}
              defaultValue={value(raw, 'cari')}
              placeholder="misalnya indomaret"
              className={FIELD}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent-strong"
          >
            Terapkan
          </button>

          {filtered ? (
            <a href="/laporan" className="text-sm text-ink-muted underline underline-offset-2">
              Bersihkan
            </a>
          ) : null}

          <label className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              name="titipan"
              value="ya"
              defaultChecked={value(raw, 'titipan') === 'ya'}
              className="size-4 accent-accent"
            />
            Ikutkan uang titipan
          </label>
        </div>
      </form>

      <div className="border border-line bg-surface p-4">
        <p className="text-sm font-medium text-ink">
          {summary.matched === 0
            ? 'Tidak ada transaksi yang cocok dengan pilihan ini.'
            : `${summary.matched} transaksi dari ${ledgerSize} tercatat.`}
        </p>

        {summary.span ? (
          <p className="mt-1 text-sm text-ink-muted">
            {formatJakarta(summary.span.from, 'date')} sampai {formatJakarta(summary.span.to, 'date')}.
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">
            Coba lebarkan rentang tanggalnya, atau kosongkan salah satu pilihan.
          </p>
        )}

        {summary.matched > 0 ? (
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="border border-line bg-sunken p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">Masuk</dt>
              <dd className="tnum mt-1 font-mono text-lg text-under">{formatIdr(summary.inflow)}</dd>
            </div>
            <div className="border border-line bg-sunken p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">Keluar</dt>
              <dd className="tnum mt-1 font-mono text-lg text-ink">{formatIdr(summary.outflow)}</dd>
            </div>
            <div className="border border-line bg-sunken p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">Selisih</dt>
              <dd
                className={`tnum mt-1 font-mono text-lg ${summary.net < 0n ? 'text-over' : 'text-under'}`}
              >
                {summary.net < 0n ? '−' : ''}
                {formatIdr(summary.net < 0n ? -summary.net : summary.net)}
              </dd>
            </div>
          </dl>
        ) : null}

        <p className="mt-3 text-xs text-ink-muted">
          Perpindahan antar akunmu sendiri tidak dihitung sebagai masuk maupun keluar, supaya satu
          kali top-up tidak terbaca dua kali.
        </p>
      </div>

      {summary.byCashflow.length > 0 ? (
        <section aria-labelledby="per-cashflow">
          <h2 id="per-cashflow" className="mb-3 text-sm font-medium text-ink">
            Per cashflow
          </h2>
          <ul className="divide-y divide-line border border-line bg-surface">
            {summary.byCashflow.map((line) => (
              <li key={line.cashflow} className="flex items-baseline justify-between gap-3 p-3">
                <span className="text-sm text-ink">{line.label}</span>
                <span className="flex items-baseline gap-3">
                  <span className="text-xs text-ink-faint">{line.count} transaksi</span>
                  <span className="tnum font-mono text-sm text-ink">{formatIdr(line.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.byCategory.length > 0 ? (
        <section aria-labelledby="per-kategori">
          <h2 id="per-kategori" className="mb-3 text-sm font-medium text-ink">
            Per kategori
          </h2>
          <ul className="divide-y divide-line border border-line bg-surface">
            {summary.byCategory.map((line) => (
              <li key={`${line.cashflow} ${line.category}`} className="p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm text-ink">
                    {line.category}
                    <span className="ml-2 text-xs text-ink-faint">
                      {CASHFLOW_LABELS[line.cashflow]}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-3">
                    <span className="tnum text-xs text-ink-faint">
                      {line.share.toFixed(1).replace('.', ',')}%
                    </span>
                    <span className="tnum font-mono text-sm text-ink">{formatIdr(line.total)}</span>
                  </span>
                </div>

                <div className="mt-2 h-1.5 bg-sunken">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${Math.min(100, line.share)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            Persentasenya dihitung terhadap arah kategori itu sendiri: kategori pengeluaran
            dibandingkan dengan total keluar, kategori pemasukan dengan total masuk.
          </p>
        </section>
      ) : null}
    </div>
  )
}
