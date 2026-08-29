/** The settings page's shape, empty. Shared by the Suspense fallback and loading.tsx. */
export function SettingsSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label="Memuat pengaturan">
      <div className="skeleton h-64 border border-line" />
      <div className="skeleton h-96 border border-line" />
    </div>
  )
}
