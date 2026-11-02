import { ShellFallback } from '@/components/shell-fallback'

/** The invites page's shell while it renders. Title mirrors page.tsx exactly. */
export default function UndanganLoading() {
  return (
    <ShellFallback
      title="Undangan"
      current="/undangan"
    >
      <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat undangan">
        <div className="skeleton h-40 border border-line" />
        <div className="skeleton h-64 border border-line" />
      </div>
    </ShellFallback>
  )
}
