import { ShellFallback } from '@/components/shell-fallback'

/**
 * The import page's shell while it renders. It existed as an heir of the root
 * loading file first, which paints "Ringkasan" with the wrong tab lit — a
 * wrong-page flash for everyone arriving from the sheet. Title and lead
 * mirror page.tsx exactly.
 */
export default function ImporLoading() {
  return (
    <ShellFallback
      title="Impor e-Statement"
      current="/impor"
      lead="Unggah e-Statement Mandiri untuk mengisi catatanmu, sekaligus memeriksa apakah pembukuan manualmu sudah benar."
    >
      <div className="space-y-4" role="status" aria-busy="true" aria-label="Menyiapkan impor">
        <div className="skeleton h-64 border border-line" />
        <div className="skeleton h-40 border border-line" />
      </div>
    </ShellFallback>
  )
}
