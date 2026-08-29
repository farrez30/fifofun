import { ShellFallback } from '@/components/shell-fallback'
import { PlannerSkeleton } from './skeleton'

/** The planner's shell while it renders. Title and lead mirror page.tsx exactly. */
export default function RencanaLoading() {
  return (
    <ShellFallback
      title="Rencana"
      current="/rencana"
      lead="Setiap angka di sini membawa sumbernya. Yang datang dari OJK, BPS atau Kemenag ditandai sebagai itu; yang diturunkan di aplikasi ini ditandai sebagai itu juga. Jawabanmu sendiri bisa disimpan, dan akan terisi lagi saat halaman ini dibuka."
    >
      <PlannerSkeleton />
    </ShellFallback>
  )
}
