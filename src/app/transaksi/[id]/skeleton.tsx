/**
 * A transaction detail's shape, empty: the summary card, the edit form, and
 * the row of actions. This page had no skeleton before loading.tsx needed one,
 * because everything was awaited before the first byte of markup.
 */
export function EntryDetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Memuat transaksi">
      <div className="skeleton squircle border border-line h-28" />
      <div className="skeleton squircle border border-line h-96" />
      <div className="skeleton squircle border border-line h-24" />
    </div>
  )
}
