'use client'

import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { BUTTON_PRIMARY, CONTROL, FieldLabel } from '@/components/field-base'
import { MoneyInput } from '@/components/money-input'
import { ACCOUNT_KEYS, ACCOUNT_KEY_LABELS } from '@/lib/ledger/settings'
import { ACCOUNT_KINDS, type AccountKind } from '@/lib/ledger/types'
import { ACCOUNT_KIND_LABELS } from '@/lib/ledger/direction'
import type { ActionResult } from '@/lib/actions'
import { createAccount, updateAccount } from './actions'
import type { AccountView } from './accounts-panel'

/**
 * One account, as the six things about it that can be decided.
 *
 * The import key is the only field here that does anything beyond labelling.
 * It says which account the e-statement and the Telegram bot write to, which
 * is why it is a picker of eight known handles rather than free text, and why
 * each option says what it is used for: "gopay" means nothing on its own, and
 * "top-up GoPay" is a sentence somebody can decide against.
 *
 * The form stays open after a save. The panel around it is re-rendered from
 * the server by then, so what a person sees is the row as it now is, next to
 * the sentence saying what changed.
 */

export function AccountForm({ account }: { account?: AccountView }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(
    account ? updateAccount : createAccount,
    null,
  )

  const ids = {
    name: useId(),
    kind: useId(),
    institution: useId(),
    key: useId(),
    at: useId(),
    identifiers: useId(),
  }

  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'ewallet')
  const [openingBalance, setOpeningBalance] = useState(() => BigInt(account?.openingBalance || '0'))
  const [key, setKey] = useState(account?.key ?? '')

  return (
    <form action={action} className="space-y-4">
      {account ? <input type="hidden" name="id" value={account.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel htmlFor={ids.name}>Nama akun</FieldLabel>
          <input
            id={ids.name}
            name="name"
            defaultValue={account?.name ?? ''}
            required
            maxLength={60}
            className={CONTROL}
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor={ids.kind}>Jenis</FieldLabel>
          <select
            id={ids.kind}
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as AccountKind)}
            className={CONTROL}
          >
            {ACCOUNT_KINDS.map((option) => (
              <option key={option} value={option}>
                {ACCOUNT_KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor={ids.institution}>Lembaga</FieldLabel>
          <input
            id={ids.institution}
            name="institution"
            defaultValue={account?.institution ?? ''}
            maxLength={60}
            placeholder="Bank Mandiri, Gojek, dan seterusnya"
            className={CONTROL}
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor={ids.key} hint="Satu kunci, satu akun.">
            Kunci impor
          </FieldLabel>
          <select
            id={ids.key}
            name="key"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className={CONTROL}
          >
            <option value="">tidak diimpor</option>
            {ACCOUNT_KEYS.map((option) => (
              <option key={option} value={option}>
                {option} · {ACCOUNT_KEY_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <MoneyInput
          label="Saldo awal"
          value={openingBalance}
          onChange={setOpeningBalance}
          name="openingBalance"
          note={
            key === 'mandiri'
              ? 'Saldo sebelum statement pertama yang kamu impor.'
              : 'Saldo pada tanggal di sebelah, sebelum satu transaksi pun tercatat di sini.'
          }
        />

        <div className="space-y-1.5">
          <FieldLabel htmlFor={ids.at} hint="Boleh dikosongkan.">
            Per tanggal
          </FieldLabel>
          <input
            id={ids.at}
            type="date"
            name="openingBalanceAt"
            defaultValue={account?.openingBalanceAt ?? ''}
            className={CONTROL}
          />
        </div>
      </div>

      {kind === 'bank' ? (
        <div className="space-y-1.5">
          <FieldLabel htmlFor={ids.identifiers} hint="Satu nomor per baris, atau dipisah koma.">
            Nomor e-wallet milikmu
          </FieldLabel>
          <textarea
            id={ids.identifiers}
            name="ownIdentifiers"
            defaultValue={account?.ownIdentifiers ?? ''}
            rows={3}
            className={`${CONTROL} h-auto py-2`}
          />
          <p className="text-xs text-ink-muted">
            Dipakai saat impor untuk membedakan top-up ke dompetmu sendiri dari uang yang kamu
            kirim ke orang lain. Tanpa ini, semua top-up terhitung pengeluaran.
          </p>
        </div>
      ) : null}

      {account ? (
        <p className="text-xs text-ink-muted">
          Mengubah saldo awal menggeser saldo akun ini di semua bulan. Untuk dompet yang sudah
          berjalan, pakai Sesuaikan saldo di Ringkasan supaya selisihnya tercatat sebagai
          transaksi.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Submit label={account ? 'Simpan akun' : 'Tambah akun'} />
        {result ? (
          <p role="status" className={`text-sm ${result.ok ? 'text-under' : 'text-over'}`}>
            {result.message}
            {result.detail ? <span className="text-ink-muted"> {result.detail}</span> : null}
          </p>
        ) : null}
      </div>
    </form>
  )
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={BUTTON_PRIMARY}
    >
      {pending ? 'Menyimpan' : label}
    </button>
  )
}
