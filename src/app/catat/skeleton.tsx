/** The entry form's shape, empty. Shared by the Suspense fallback and loading.tsx. */
export function EntrySkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Menyiapkan formulir">
      <div className="skeleton squircle border border-line h-96" />
      <div className="skeleton squircle border border-line h-40" />
    </div>
  )
}
