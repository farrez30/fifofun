/** The report's shape, empty. Shared by the Suspense fallback and loading.tsx. */
export function ReportSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat laporan">
      <div className="skeleton squircle shadow-xs h-32" />
      <div className="skeleton squircle shadow-xs h-24" />
      <div className="skeleton squircle shadow-xs h-64" />
    </div>
  )
}
