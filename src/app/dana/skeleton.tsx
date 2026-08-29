/** The funds page's shape, empty. Shared by the Suspense fallback and loading.tsx. */
export function FundsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat pos dana">
      <div className="skeleton h-20 border border-line" />
      <div className="skeleton h-96 border border-line" />
    </div>
  )
}
