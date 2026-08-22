import Link from 'next/link'
import { AccountMark } from '@/components/marks'
import type { AccountKind } from '@/lib/ledger/types'

/**
 * Whose money the trend is about.
 *
 * The headline figures answer for the household, which is the right scope for
 * deciding whether a month was affordable and the wrong one for asking what a
 * single wallet is doing. This switches the two charts below it to one
 * account, and says which one in their captions.
 *
 * Plain links rather than a client component: the whole series is computed on
 * the server in bigint, the choice belongs in the address bar so it can be
 * sent to somebody, and a page that needs no JavaScript to change scope is one
 * fewer thing that can fail.
 */

export interface ScopeAccount {
  id: string
  name: string
  kind: AccountKind
}

export function AccountScope({
  accounts,
  current,
}: {
  accounts: ScopeAccount[]
  /** The account being shown, or null for the whole household. */
  current: string | null
}) {
  return (
    <nav aria-label="Lingkup tren" className="mb-3">
      <ul className="flex flex-wrap border border-line">
        <li>
          <Link
            href="/#tren"
            aria-current={current === null ? 'true' : undefined}
            className={`inline-flex h-11 items-center px-3 text-xs transition-colors duration-150 ${
              current === null
                ? 'bg-accent font-medium text-paper'
                : 'bg-surface text-ink-muted hover:text-ink'
            }`}
          >
            Semua akun
          </Link>
        </li>
        {accounts.map((account) => (
          <li key={account.id}>
            <Link
              href={`/?akun=${account.id}#tren`}
              aria-current={current === account.id ? 'true' : undefined}
              className={`inline-flex h-11 items-center px-3 text-xs transition-colors duration-150 ${
                current === account.id
                  ? 'bg-accent font-medium text-paper'
                  : 'bg-surface text-ink-muted hover:text-ink'
              }`}
            >
              <AccountMark name={account.name} kind={account.kind} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
