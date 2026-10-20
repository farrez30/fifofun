import { Fragment, type ReactNode } from 'react'

/**
 * Short facts side by side: "12 transaksi · Jan 2026 · sekarang di Makan".
 *
 * Each part is its own flex item, so a narrow screen wraps between parts and
 * never inside one ("penghasilan / tidak tetap"), and the dot sits in an
 * `aria-hidden` span so a screen reader hears the parts, not "titik tengah".
 * The markup the rest of the app already writes by hand (transaction-table,
 * recent-entries), in one place.
 *
 * Falsy parts are dropped, so a conditional part is just `cond && '…'`.
 */
export function MetaRow({
  parts,
  as: Tag = 'span',
  className = '',
}: {
  parts: ReactNode[]
  as?: 'span' | 'p'
  className?: string
}) {
  const shown = parts.filter((part) => part !== null && part !== undefined && part !== false && part !== '')
  return (
    <Tag className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`}>
      {shown.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <span aria-hidden="true" className="text-ink-faint">
              ·
            </span>
          ) : null}
          <span className="min-w-0">{part}</span>
        </Fragment>
      ))}
    </Tag>
  )
}
