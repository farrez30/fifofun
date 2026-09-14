/**
 * The settings page's shape, empty. Shared by the Suspense fallback and
 * loading.tsx. Three blocks, one per section the real page stacks: accounts,
 * categories, appearance. Two used to stand in for three, and the missing
 * block read as the page shrinking rather than as a placeholder.
 */
export function SettingsSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label="Memuat pengaturan">
      <div className="skeleton squircle shadow-xs h-64" />
      <div className="skeleton squircle shadow-xs h-96" />
      <div className="skeleton squircle shadow-xs h-52" />
    </div>
  )
}
