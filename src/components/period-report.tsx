import { formatJakarta } from '@/lib/datetime'
import type { CategoryTotal, PeriodFilter, PeriodSummary } from '@/lib/ledger/period'
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

/*
  The filter row was the one place in the app that sized its controls with
  padding instead of a height, which left six of them around 35px while every
  other form in the app stood at 44. Six controls is also the densest form here,
  so it is the worst place to be the exception.
*/
const FIELD =
  'mt-1 h-11 w-full rounded-sm border border-line bg-paper px-2.5 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent sm:text-sm'

const LABEL = 'block text-xs font-medium uppercase tracking-wide text-ink-faint'

/** One row of the report: a name, a share, a figure, and a bar for the share. */
function Line({
  name,
  note,
  share,
  total,
}: {
  name: string
  note: string
  share: number
  total: bigint
}) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm text-ink">
          {name}
          <span className="ml-2 text-xs text-ink-faint">{note}</span>
        </span>
        <span className="flex items-baseline gap-3">
          <span className="tnum text-xs text-ink-faint">
            {share.toFixed(1).replace('.', ',')}%
          </span>
          <span className="tnum font-mono text-sm text-ink">{formatIdr(total)}</span>
        </span>
      </div>

      <div className="mt-2 h-1.5 bg-sunken">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, share)}%` }} />
      </div>
    </>
  )
}

/**
 * Who the money went to inside one category.
 *
 * The level underneath the numbers, and the one that answers why a figure is
 * what it is. Eight at most: past that the honest answer is the ledger itself,
 * which the filter above reaches in one click.
 */
function Merchants({ line }: { line: CategoryTotal }) {
  if (line.merchants.length < 2) return null

  return (
    <details className="mt-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs text-ink-muted underline underline-offset-2 marker:content-none">
        Ke mana perginya
      </summary>
      <ul className="mt-1.5 space-y-1">
        {line.merchants.map((merchant) => (
          <li
            key={merchant.label}
            className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs"
          >
            <span className="text-ink-muted">
              {merchant.label}
              <span className="ml-2 text-ink-faint">{merchant.count}x</span>
            </span>
            <span className="tnum font-mono text-ink-muted">{formatIdr(merchant.total)}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

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
            className="h-11 rounded-sm bg-accent px-4 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent-strong"
          >
            Terapkan
          </button>

          {filtered ? (
            /* Sized to the button beside it rather than to its own text. A
               standalone control is not covered by the inline-in-a-sentence
               exemption, and padding alone left this at 37px against the 44 a
               finger needs. */
            <a
              href="/laporan"
              className="inline-flex min-h-11 items-center rounded-sm px-2 text-sm text-ink-muted underline underline-offset-2"
            >
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

      {summary.byGroup.length > 0 ? (
        <section aria-labelledby="per-kategori">
          <h2 id="per-kategori" className="mb-3 text-sm font-medium text-ink">
            Per kategori
          </h2>
          <ul className="divide-y divide-line border border-line bg-surface">
            {summary.byGroup.map((group) => (
              <li key={`${group.cashflow} ${group.group}`} className="p-3">
                <Line
                  name={group.group}
                  note={CASHFLOW_LABELS[group.cashflow]}
                  share={group.share}
                  total={group.total}
                />

                {/* A group of one is the category itself, and opening it would
                    show the same figure a second time. */}
                {group.categories.length > 1 ? (
                  <details className="mt-1">
                    {/* The whole row is the target, not the eight pixels of
                        text in it: a disclosure the size of its own label is
                        the smallest thing on the page and the one most often
                        reached for on a phone. */}
                    <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs text-accent underline underline-offset-2 marker:content-none">
                      {group.categories.length} pos di dalamnya
                    </summary>
                    <ul className="mt-2 space-y-2 border-l border-line pl-3">
                      {group.categories.map((line) => (
                        <li key={`${line.cashflow} ${line.category}`}>
                          <Line
                            name={line.category}
                            note={`${line.count} transaksi`}
                            share={line.share}
                            total={line.total}
                          />
                          <Merchants line={line} />
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  group.categories.map((line) => <Merchants key={line.category} line={line} />)
                )}
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
