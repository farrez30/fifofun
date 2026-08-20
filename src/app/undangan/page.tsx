import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { getHousehold } from '@/lib/queries/household'
import { createClient, getUser } from '@/lib/supabase/server'
import { InvitesPanel } from './invites-panel'

export const metadata: Metadata = { title: 'Undangan' }

/**
 * Who else is allowed in.
 *
 * Registration is closed without one of these, so this page is the only way a
 * second person ever reaches the household. It is not in the main navigation
 * because it is used twice and then never again, and a permanent tab for that
 * costs every other page a little attention.
 */
export default async function InvitesPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const household = await getHousehold()
  if (!household) redirect('/gabung')

  const supabase = await createClient()
  // The hash is deliberately not selected. Nothing on this page needs it, and a
  // column that never leaves the database cannot leak from a page that never
  // asked for it.
  const { data } = await supabase
    .from('household_invites')
    .select('id, created_at, expires_at, redeemed_at')
    .order('created_at', { ascending: false })

  const invites = (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    redeemedAt: (row.redeemed_at as string | null) ?? null,
  }))

  return (
    <AppShell
      title="Undangan"
      email={user.email ?? ''}
      current="/undangan"
      lead="Tanpa kode undangan tidak ada akun baru yang bisa dibuat, dan itu yang menjaga catatan rumah tangga ini tetap milik orang yang kamu izinkan saja."
    >
      <InvitesPanel invites={invites} now={new Date().toISOString()} />
    </AppShell>
  )
}
