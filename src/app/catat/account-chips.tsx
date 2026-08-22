'use client'

import { AccountMark } from '@/components/marks'
import type { AccountKind } from '@/lib/ledger/types'

/**
 * Which account a movement touches, as a row of radio chips.
 *
 * A select would be shorter and would hide the one thing worth seeing: how
 * many accounts there are and which kind each one is. The radio stays visible
 * rather than being replaced by a styled box, so the focus ring is the
 * browser's own and the touch target keeps the floor the stylesheet sets.
 */

export interface AccountOption {
  id: string
  name: string
  kind: AccountKind
}

export function AccountChips({
  name,
  legend,
  accounts,
  defaultValue,
}: {
  name: string
  legend: string
  accounts: AccountOption[]
  defaultValue?: string
}) {
  return (
    <fieldset>
      <legend className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        {legend}
      </legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {accounts.map((account, index) => (
          <label
            key={account.id}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-line bg-paper px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong has-checked:border-accent has-checked:bg-accent-wash"
          >
            <input
              type="radio"
              name={name}
              value={account.id}
              defaultChecked={defaultValue ? account.id === defaultValue : index === 0}
              className="size-4 shrink-0 accent-[var(--color-accent)]"
            />
            <AccountMark name={account.name} kind={account.kind} />
          </label>
        ))}
      </div>
    </fieldset>
  )
}
