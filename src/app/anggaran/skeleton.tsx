/** The budget table's shape, empty. Shared by the Suspense fallback and loading.tsx. */
export function BudgetSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat anggaran">
      <div className="skeleton squircle shadow-xs h-12" />
      <div className="skeleton squircle shadow-xs h-96" />
    </div>
  )
}
