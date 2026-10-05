'use client'

import type { CSSProperties } from 'react'
import { AccountMark } from '@/components/marks'
import { inkOn } from '@/lib/brand'
import type { AccountKind } from '@/lib/ledger/types'

/**
 * Which account a movement touches, as a row of radio chips.
 *
 * A select would be shorter and would hide the one thing worth seeing: how
 * many accounts there are and which kind each one is. The radio stays visible
 * rather than being replaced by a styled box, so the focus ring is the
 * browser's own and the touch target keeps the floor the stylesheet sets.
 *
 * A picked chip fills with the institution's own colour, the way its app
 * looks, so "DANA" is found by its blue before it is read. The ink on it is
 * whichever of black and white contrasts more (src/lib/brand.ts), and an
 * account without a colour falls back to the accent wash every other choice
 * in the app uses. Unpicked chips stay neutral: twelve saturated chips at
 * once would make the one that is picked the hardest to see.
 */

export interface AccountOption {
  id: string
  name: string
  kind: AccountKind
  color?: string | null
  logoUrl?: string | null
}

const CHIP =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-line bg-paper px-3 text-subhead text-ink transition-colors duration-150 hover:border-line-strong'
const PICKED_ACCENT = 'has-checked:border-accent has-checked:bg-accent-wash'
/*
  The chip is the target, and it already stands 44px tall. The global touch
  floor in globals.css would also blow the radio inside it up to 44px on a
  phone, a grey disc that outweighed the bank's colour; inside a chip the
  radio only has to show the state, so it keeps its 16px.
*/
export const CHIP_RADIO = 'size-4 shrink-0 pointer-coarse:min-h-0 pointer-coarse:min-w-0'
// The icon's hairline takes the ink too: Jago's yellow tile on Jago's yellow
// chip would otherwise lose its edge entirely.
const PICKED_BRAND =
  'has-checked:border-[var(--brand)] has-checked:bg-[var(--brand)] has-checked:text-[var(--brand-ink)] has-checked:[&_img]:ring-current/35'

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
      <legend className="text-subhead font-medium text-ink">
        {legend}
      </legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {accounts.map((account, index) => {
          const brand = account.color
            ? ({ '--brand': account.color, '--brand-ink': inkOn(account.color) } as CSSProperties)
            : undefined
          return (
            <label
              key={account.id}
              style={brand}
              className={`${CHIP} ${brand ? PICKED_BRAND : PICKED_ACCENT}`}
            >
              <input
                type="radio"
                name={name}
                value={account.id}
                defaultChecked={defaultValue ? account.id === defaultValue : index === 0}
                className={`${CHIP_RADIO} ${brand ? 'accent-[var(--brand-ink)]' : 'accent-[var(--color-accent)]'}`}
              />
              <AccountMark name={account.name} kind={account.kind} logo={account.logoUrl} />
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
