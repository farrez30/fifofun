/**
 * The dashboard's shape, empty. Shared by the in-page Suspense fallback and
 * the route's loading.tsx, so both doors show the same room.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat ringkasan">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24 border border-line" />
        ))}
      </div>
      <div className="skeleton h-64 border border-line" />
      <div className="skeleton h-80 border border-line" />
    </div>
  )
}
