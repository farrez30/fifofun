/** The planner's shape, empty. Shared by the Suspense fallback and loading.tsx. */
export function PlannerSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label="Menyiapkan simulasi">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 border border-line" />
        ))}
      </div>
      <div className="skeleton h-72 border border-line" />
      <div className="skeleton h-96 border border-line" />
    </div>
  )
}
