/**
 * A transaction detail's shape, empty: the summary card, the edit form, and
 * the row of actions. This page had no skeleton before loading.tsx needed one,
 * because everything was awaited before the first byte of markup.
 */
export function EntryDetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Memuat transaksi">
      <div className="skeleton h-28 border border-line" />
      <div className="skeleton h-96 border border-line" />
      <div className="skeleton h-24 border border-line" />
    </div>
  )
}
