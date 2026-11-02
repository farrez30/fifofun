import { ShellFallback } from '@/components/shell-fallback'
import { SettingsSkeleton } from './skeleton'

/** The settings page's shell while it renders. Title mirrors page.tsx exactly. */
export default function PengaturanLoading() {
  return (
    <ShellFallback
      title="Pengaturan"
      current="/pengaturan"
    >
      <SettingsSkeleton />
    </ShellFallback>
  )
}
