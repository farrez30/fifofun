'use client'

import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { BUTTON_PRIMARY, CONTROL, CONTROL_INLINE, FieldLabel, FieldRow } from '@/components/field-base'
import { MoneyInput } from '@/components/money-input'
import { PICKER_START } from '@/lib/brand'
import { ACCOUNT_KEYS, ACCOUNT_KEY_LABELS } from '@/lib/ledger/settings'
import { ACCOUNT_KINDS, type AccountKind } from '@/lib/ledger/types'
import { ACCOUNT_KIND_LABELS } from '@/lib/ledger/direction'
import type { ActionResult } from '@/lib/actions'
import { createAccount, updateAccount } from './actions'
import type { AccountView } from './accounts-panel'
import { useActionToast } from '@/components/use-action-toast'

/**
 * One account, as the things about it that can be decided.
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
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(
    account ? updateAccount : createAccount,
    null,
  )
  useActionToast(result, pending)

  const ids = {
    name: useId(),
    kind: useId(),
    institution: useId(),
    key: useId(),
    at: useId(),
    identifiers: useId(),
    reference: useId(),
    color: useId(),
    logo: useId(),
    removeLogo: useId(),
  }

  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'ewallet')
  const [openingBalance, setOpeningBalance] = useState(() => BigInt(account?.openingBalance || '0'))
  const [key, setKey] = useState(account?.key ?? '')
  const [color, setColor] = useState(account?.color ?? '')
  const [removeLogo, setRemoveLogo] = useState(false)

  return (
    /*
      React resets a form after its action finishes, and a controlled select
      survives that only on screen: the DOM falls back to the first option
      while state keeps the saved one. The form stays open after a save, so a
      second press would post "Income" and "Berdiri sendiri" (or the wrong
      import key) without anyone touching them. What is shown is already what
      was saved, so there is nothing to reset.
    */
    <form action={action} onReset={(event) => event.preventDefault()} className="space-y-4">
      {account ? <input type="hidden" name="id" value={account.id} /> : null}

      {/*
        A grouped list rather than the two-column grid this used to be. Six
        fields in a 2fr/3fr grid of stacked label-above-control pairs read as
        a form; the same six in one row-per-field card read as a settings
        screen, which is what a household editing a bank account already
        expects from every native app on the phone it opened this on.

        Saldo awal keeps `MoneyInput`'s own compound layout (a floating
        "Rp" prefix, a note line under it) rather than being squeezed into a
        row: that component serves six pages and forcing a row shape onto it
        here would mean a seventh, one-off variant of a control everywhere
        else in the app the account form is not.
      */}
      <div className="rows-inset squircle rounded-md bg-surface shadow-xs">
        <FieldRow htmlFor={ids.name} label="Nama akun">
          <input
            id={ids.name}
            name="name"
            defaultValue={account?.name ?? ''}
            required
            maxLength={60}
            className={CONTROL_INLINE}
          />
        </FieldRow>

        <FieldRow htmlFor={ids.kind} label="Jenis">
          <select
            id={ids.kind}
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as AccountKind)}
            className={CONTROL_INLINE}
          >
            {ACCOUNT_KINDS.map((option) => (
              <option key={option} value={option}>
                {ACCOUNT_KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </FieldRow>

        <FieldRow htmlFor={ids.institution} label="Lembaga">
          <input
            id={ids.institution}
            name="institution"
            defaultValue={account?.institution ?? ''}
            maxLength={60}
            placeholder="Bank Mandiri, Gojek, dst."
            className={`${CONTROL_INLINE} placeholder:text-right`}
          />
        </FieldRow>

        <FieldRow htmlFor={ids.color} label="Warna" hint="Mengisi pilihan akun saat dipilih.">
          <span className="flex items-center justify-end gap-2">
            {/* The colour input cannot be empty, so the value posted is this
                hidden field and "Tanpa warna" clears it. */}
            <input type="hidden" name="color" value={color} />
            <input
              id={ids.color}
              type="color"
              value={color || PICKER_START}
              onChange={(event) => setColor(event.target.value)}
              className="size-9 shrink-0 cursor-pointer rounded-sm border border-line bg-transparent p-0.5"
            />
            <span className="tnum min-w-[4.5rem] font-mono text-footnote text-ink-muted">
              {color || 'aksen'}
            </span>
            {color ? (
              <button
                type="button"
                onClick={() => setColor('')}
                className="min-h-11 px-1 text-footnote text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Tanpa warna
              </button>
            ) : null}
          </span>
        </FieldRow>

        <FieldRow htmlFor={ids.logo} label="Logo" hint="PNG, JPEG, atau WebP. Disimpan kecil, tidak dibagikan.">
          <span className="flex min-w-0 items-center justify-end gap-2">
            {account?.logoUrl && !removeLogo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the stored 64px icon itself
              <img src={account.logoUrl} alt="" width={28} height={28} className="size-7 rounded-[8px] ring-1 ring-line" />
            ) : null}
            <input
              id={ids.logo}
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="min-w-0 max-w-[13rem] text-body text-ink-muted file:mr-2 file:min-h-11 file:cursor-pointer file:rounded-sm file:border file:border-line file:bg-paper file:px-2.5 file:text-subhead file:text-ink"
            />
          </span>
        </FieldRow>

        {account?.logoUrl ? (
          <FieldRow htmlFor={ids.removeLogo} label="Hapus logo">
            <input
              id={ids.removeLogo}
              type="checkbox"
              name="removeLogo"
              checked={removeLogo}
              onChange={(event) => setRemoveLogo(event.target.checked)}
              className="size-5 accent-[var(--color-accent)]"
            />
          </FieldRow>
        ) : null}

        <FieldRow htmlFor={ids.key} label="Kunci impor" hint="Satu kunci, satu akun.">
          <select
            id={ids.key}
            name="key"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className={CONTROL_INLINE}
          >
            <option value="">tidak diimpor</option>
            {ACCOUNT_KEYS.map((option) => (
              <option key={option} value={option}>
                {option} · {ACCOUNT_KEY_LABELS[option]}
              </option>
            ))}
          </select>
        </FieldRow>

        {kind !== 'cash' ? (
          <FieldRow
            htmlFor={ids.reference}
            label="Nomor rekening"
            hint="Transfer dengan nomor ini dicatat sebagai pindah dana."
          >
            <input
              id={ids.reference}
              name="reference"
              defaultValue={account?.reference ?? ''}
              inputMode="numeric"
              autoComplete="off"
              maxLength={40}
              className={`${CONTROL_INLINE} tnum`}
            />
          </FieldRow>
        ) : null}

        <FieldRow htmlFor={ids.at} label="Per tanggal" hint="Boleh dikosongkan.">
          <input
            id={ids.at}
            type="date"
            name="openingBalanceAt"
            defaultValue={account?.openingBalanceAt ?? ''}
            className={CONTROL_INLINE}
          />
        </FieldRow>
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
          <p className="text-footnote text-ink-muted">
            Dipakai saat impor untuk membedakan top-up ke dompetmu sendiri dari uang yang kamu
            kirim ke orang lain. Tanpa ini, semua top-up terhitung pengeluaran.
          </p>
        </div>
      ) : null}

      {account ? (
        <p className="text-footnote text-ink-muted">
          Mengubah saldo awal menggeser saldo akun ini di semua bulan. Untuk dompet yang sudah
          berjalan, pakai Sesuaikan saldo di Ringkasan supaya selisihnya tercatat sebagai
          transaksi.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Submit label={account ? 'Simpan akun' : 'Tambah akun'} />
      </div>
    </form>
  )
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      aria-busy={pending}
      className={BUTTON_PRIMARY}
    >
      {pending ? 'Menyimpan' : label}
    </button>
  )
}
