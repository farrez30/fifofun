'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { INVITE_TTL_DAYS, stateOf, type InviteRow, type InviteState } from '@/lib/invites'
import { type IssueResult, issueInvite, revokeInvite } from './actions'

/**
 * The list of invitations, and the one moment a code is readable.
 *
 * A code appears exactly once, immediately after it is issued, and the panel
 * says so rather than letting somebody navigate away and find out. Only the
 * hash reaches the database, so there is no view that could show it again.
 */

const STATE_LABEL: Record<InviteState, string> = {
  open: 'Menunggu dipakai',
  redeemed: 'Sudah dipakai',
  expired: 'Kedaluwarsa',
}

const STATE_STYLE: Record<InviteState, string> = {
  open: 'text-ink',
  redeemed: 'text-ink-faint',
  expired: 'text-ink-faint',
}

/** `20 Agu 2026, 14.05` */
const when = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function Issue() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-sm bg-accent px-4 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent-strong disabled:opacity-60"
    >
      {pending ? 'Membuat' : 'Buat kode undangan'}
    </button>
  )
}

function Revoke() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 rounded-sm border border-line px-3 text-xs font-medium text-ink transition-colors duration-150 hover:border-over/50 hover:text-over disabled:opacity-60"
    >
      {pending ? 'Membatalkan' : 'Batalkan'}
    </button>
  )
}

interface Props {
  /** Serialised for the boundary; dates cross it as ISO strings. */
  invites: { id: string; createdAt: string; expiresAt: string; redeemedAt: string | null }[]
  now: string
}

export function InvitesPanel({ invites, now }: Props) {
  const [issued, issue] = useActionState<IssueResult | null>(issueInvite, null)
  const [revoked, revoke] = useActionState<IssueResult | null, FormData>(revokeInvite, null)

  const at = new Date(now)
  const rows: (InviteRow & { state: InviteState })[] = invites.map((invite) => {
    const row = {
      id: invite.id,
      createdAt: new Date(invite.createdAt),
      expiresAt: new Date(invite.expiresAt),
      redeemedAt: invite.redeemedAt ? new Date(invite.redeemedAt) : null,
    }
    return { ...row, state: stateOf(row, at) }
  })

  return (
    <div className="space-y-6">
      <div className="border border-line bg-surface p-6">
        <h2 className="text-base font-medium text-ink">Undang satu orang</h2>
        <p className="mt-2 max-w-prose text-sm text-ink-muted">
          Kode berlaku sekali pakai dan hangus setelah {INVITE_TTL_DAYS} hari. Orang yang memakainya
          masuk sebagai anggota: bisa mencatat, mengimpor dan merencanakan, tapi tidak bisa
          mengundang orang lain.
        </p>

        <form action={issue} className="mt-4">
          <Issue />
        </form>

        {issued?.code ? (
          <div className="mt-4 border border-accent/40 bg-accent-wash p-4">
            <p className="text-xs uppercase tracking-widest text-ink-muted">Kodenya</p>
            <p className="tnum mt-2 select-all font-mono text-2xl tracking-widest text-ink">
              {issued.code}
            </p>
            {/* Said here rather than discovered later. There is no view that
                could show this again, because only the hash was stored. */}
            <p className="mt-3 text-xs text-ink">
              Salin sekarang. Kode ini tidak akan ditampilkan lagi, dan aplikasi ini pun tidak
              menyimpannya. Kalau hilang, batalkan undangannya lalu buat yang baru.
            </p>
          </div>
        ) : null}

        {issued && !issued.ok ? (
          <p
            role="status"
            aria-live="polite"
            className="mt-4 rounded-sm border border-over/30 bg-over-wash px-3 py-2 text-sm text-over"
          >
            {issued.message}
          </p>
        ) : null}
      </div>

      <div className="border border-line bg-surface">
        <div className="border-b border-line p-4">
          <h2 className="text-sm font-medium text-ink">Undangan yang pernah dibuat</h2>
        </div>

        {rows.length === 0 ? (
          <p className="p-6 text-sm text-ink-muted">
            Belum ada undangan. Rumah tangga ini hanya berisi akun yang membuatnya.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((invite) => (
              <li
                key={invite.id}
                data-state={invite.state}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4"
              >
                <div className="min-w-0">
                  <p className={`text-sm ${STATE_STYLE[invite.state]}`}>
                    {STATE_LABEL[invite.state]}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    Dibuat {when.format(invite.createdAt)}
                    {invite.redeemedAt
                      ? `, dipakai ${when.format(invite.redeemedAt)}`
                      : `, berlaku sampai ${when.format(invite.expiresAt)}`}
                  </p>
                </div>

                {/* A spent invitation has nothing left to withdraw, and the
                    membership it produced is not undone by deleting it. */}
                {invite.state === 'open' ? (
                  <form action={revoke}>
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <Revoke />
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {revoked && !revoked.ok ? (
          <p
            role="status"
            aria-live="polite"
            className="border-t border-line px-4 py-3 text-sm text-over"
          >
            {revoked.message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
