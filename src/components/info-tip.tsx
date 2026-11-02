import { useId } from 'react'
import { Info } from '@phosphor-icons/react/dist/ssr/Info'

/**
 * What a figure or column means, one tap away instead of a paragraph under it.
 *
 * The native popover rather than a hover tooltip: a hover hint is unreachable
 * on a phone, which is where this ledger is read, and `popovertarget` opens,
 * light-dismisses and closes on Escape with no script at all. It works before
 * hydration and under the nonce CSP alike. Without anchor positioning the
 * browser centres it, which on a phone is the right place anyway.
 *
 * Only for definitions. A sentence about the state of the data (why a column
 * is empty, what a save will change) stays visible next to the data.
 */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={label}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full align-middle text-ink-faint transition-colors duration-150 hover:text-ink -my-3"
      >
        <Info aria-hidden="true" weight="regular" className="size-4" />
      </button>
      <div
        id={id}
        popover="auto"
        className="m-auto max-w-xs rounded-md border border-line bg-surface p-3 text-xs text-ink shadow-md"
      >
        {children}
      </div>
    </>
  )
}
