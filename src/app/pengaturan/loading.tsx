import { ShellFallback } from '@/components/shell-fallback'
import { SettingsSkeleton } from './skeleton'

/** The settings page's shell while it renders. Title and lead mirror page.tsx exactly. */
export default function PengaturanLoading() {
  return (
    <ShellFallback
      title="Pengaturan"
      current="/pengaturan"
      lead="Akun dan kategori yang dipakai semua halaman. Nama boleh diganti kapan saja: yang berubah tampilannya, bukan angkanya."
    >
      <SettingsSkeleton />
    </ShellFallback>
  )
}
