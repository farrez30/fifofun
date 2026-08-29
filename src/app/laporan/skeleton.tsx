/** The report's shape, empty. Shared by the Suspense fallback and loading.tsx. */
export function ReportSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat laporan">
      <div className="skeleton h-32 border border-line" />
      <div className="skeleton h-24 border border-line" />
      <div className="skeleton h-64 border border-line" />
    </div>
  )
}
