/**
 * The dashboard's shape, empty. Shared by the in-page Suspense fallback and
 * the route's loading.tsx, so both doors show the same room.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat ringkasan">
      {/* Below `sm` the stats are a swipeable deck with the next card peeking,
          so the placeholder holds that shape too — a stacked grid here would
          read as the page changing its mind when the real one lands. */}
      <div className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24 w-[85%] shrink-0 border border-line sm:w-auto" />
        ))}
      </div>
      <div className="skeleton h-64 border border-line" />
      <div className="skeleton h-80 border border-line" />
    </div>
  )
}
