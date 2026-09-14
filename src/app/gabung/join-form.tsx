'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { type JoinResult, joinHousehold } from './actions'
import { BUTTON_PRIMARY, CONTROL } from '@/components/field-base'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-full ${BUTTON_PRIMARY}`}
    >
      {pending ? 'Memeriksa' : 'Gabung'}
    </button>
  )
}

export function JoinForm() {
  const [state, action] = useActionState<JoinResult | null, FormData>(joinHousehold, null)

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="code" className="block text-sm font-medium text-ink">
          Kode undangan
        </label>
        <input
          id="code"
          name="code"
          type="text"
          required
          autoFocus
          // Off, all of it. A code is read off another screen and typed once;
          // a phone that capitalises and corrects it is working against that.
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={state ? 'join-message' : 'join-hint'}
          aria-invalid={state && !state.ok ? true : undefined}
          placeholder="ABCDE-FGHJK"
          className={`tnum ${CONTROL} font-mono uppercase tracking-widest placeholder:tracking-widest`}
        />
        <p id="join-hint" className="text-xs text-ink-faint">
          Sepuluh karakter. Huruf besar kecil dan tanda hubung tidak masalah.
        </p>
      </div>

      {state ? (
        <p
          id="join-message"
          role="status"
          aria-live="polite"
          className="rounded-sm border border-over/30 bg-over-wash px-3 py-2 text-sm text-over"
        >
          {state.message}
        </p>
      ) : null}

      <Submit />
    </form>
  )
}
