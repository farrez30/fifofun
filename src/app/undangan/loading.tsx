import { ShellFallback } from '@/components/shell-fallback'

/** The invites page's shell while it renders. Title and lead mirror page.tsx exactly. */
export default function UndanganLoading() {
  return (
    <ShellFallback
      title="Undangan"
      current="/undangan"
      lead="Tanpa kode undangan tidak ada akun baru yang bisa dibuat, dan itu yang menjaga catatan rumah tangga ini tetap milik orang yang kamu izinkan saja."
    >
      <div className="space-y-4" role="status" aria-busy="true" aria-label="Memuat undangan">
        <div className="skeleton h-40 border border-line" />
        <div className="skeleton h-64 border border-line" />
      </div>
    </ShellFallback>
  )
}
