/** The entry form's shape, empty. Shared by the Suspense fallback and loading.tsx. */
export function EntrySkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Menyiapkan formulir">
      <div className="skeleton h-96 border border-line" />
      <div className="skeleton h-40 border border-line" />
    </div>
  )
}
