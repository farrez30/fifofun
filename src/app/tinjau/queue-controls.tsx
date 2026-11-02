import { queueHref, type QueueOptions } from './query'

/**
 * How the queue is arranged.
 *
 * Plain links, no JavaScript: the arrangement lives in the address bar because
 * the grouping happens on the server, and a link is also the only control that
 * the back button undoes and that can be sent to somebody.
 *
 * Grouping by month fixes the order to newest first, so the order group turns
 * into a sentence there rather than into two links that would do nothing.
 */

const ORDER_LABELS = { nominal: 'Nominal terbesar', waktu: 'Terbaru' } as const
const GROUP_LABELS = { lawan: 'Lawan transaksi', bulan: 'Bulan' } as const

function Choice({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex h-11 items-center border-b-2 px-2 transition-colors duration-150 ${
        active
          ? 'border-accent font-medium text-ink'
          : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      {children}
    </a>
  )
}

export function QueueControls({ options }: { options: QueueOptions }) {
  const byMonth = options.kelompok === 'bulan'

  return (
    <nav
      aria-label="Urutan dan kelompok antrean"
      className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line pb-1 text-sm"
    >
      <div role="group" aria-labelledby="urut-label" className="flex items-center gap-1">
        <span
          id="urut-label"
          className="mr-1 text-xs font-medium uppercase tracking-wide text-ink-faint"
        >
          Urutkan
        </span>
        {byMonth ? (
          <span className="text-ink-muted">Terbaru, karena kelompoknya bulan</span>
        ) : (
          (['nominal', 'waktu'] as const).map((order) => (
            <Choice
              key={order}
              href={queueHref({ ...options, urut: order })}
              active={options.urut === order}
            >
              {ORDER_LABELS[order]}
            </Choice>
          ))
        )}
      </div>

      <div role="group" aria-labelledby="kelompok-label" className="flex items-center gap-1">
        <span
          id="kelompok-label"
          className="mr-1 text-xs font-medium uppercase tracking-wide text-ink-faint"
        >
          Kelompokkan
        </span>
        {(['lawan', 'bulan'] as const).map((grouping) => (
          <Choice
            key={grouping}
            href={queueHref({ ...options, kelompok: grouping })}
            active={options.kelompok === grouping}
          >
            {GROUP_LABELS[grouping]}
          </Choice>
        ))}
      </div>
    </nav>
  )
}
