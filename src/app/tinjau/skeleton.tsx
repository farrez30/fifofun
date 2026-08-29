/** The queue's shape, empty. Shared by the Suspense fallback and loading.tsx. */
export function QueueSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-busy="true" aria-label="Memuat antrean">
      <div className="skeleton h-20 border border-line" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton h-16 border border-line" />
      ))}
    </div>
  )
}
