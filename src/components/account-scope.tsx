import Link from 'next/link'
import { AccountMark } from '@/components/marks'
import { NavHint } from '@/components/nav-hint'
import { SEGMENT, SEGMENT_ON, SEGMENTED } from '@/components/field-base'
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
      <ul className={`${SEGMENTED} flex-wrap`}>
        <li>
          <Link
            href="/#tren"
            aria-current={current === null ? 'true' : undefined}
            className={`${SEGMENT} ${current === null ? SEGMENT_ON : ''}`}
          >
            Semua akun
            <NavHint className="ml-1.5" />
          </Link>
        </li>
        {accounts.map((account) => (
          <li key={account.id}>
            <Link
              href={`/?akun=${account.id}#tren`}
              aria-current={current === account.id ? 'true' : undefined}
              className={`${SEGMENT} ${current === account.id ? SEGMENT_ON : ''}`}
            >
              <AccountMark name={account.name} kind={account.kind} />
              <NavHint className="ml-1.5" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
