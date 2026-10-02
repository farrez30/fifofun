/** The map page's shape, empty. Shared by the Suspense fallback and loading.tsx. */
export function MapSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat peta belanja">
      <div className="skeleton squircle shadow-xs h-28" />
      <div className="skeleton squircle shadow-xs h-[55vh] min-h-80 sm:h-[60vh]" />
      <div className="skeleton squircle shadow-xs h-64" />
    </div>
  )
}
