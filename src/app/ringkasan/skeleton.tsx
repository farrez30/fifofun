/** The summary's shape, empty. Shared by the Suspense fallback and loading.tsx. */
export function SummarySkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Memuat ringkasan">
      <div className="skeleton squircle border border-line h-16" />
      <div className="skeleton squircle border border-line h-56" />
      <div className="skeleton squircle border border-line h-80" />
      <div className="skeleton squircle border border-line h-40" />
    </div>
  )
}
