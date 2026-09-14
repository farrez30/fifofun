/** The queue's shape, empty. Shared by the Suspense fallback and loading.tsx. */
export function QueueSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-busy="true" aria-label="Memuat antrean">
      <div className="skeleton squircle shadow-xs h-20" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton squircle shadow-xs h-16" />
      ))}
    </div>
  )
}
