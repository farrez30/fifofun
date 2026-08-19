'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { type AuthState, authenticate } from './actions'

const EMPTY: AuthState = {}

function Submit({
  intent,
  children,
  variant,
}: {
  intent: 'signin' | 'signup'
  children: string
  variant: 'primary' | 'secondary'
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      name="intent"
      value={intent}
      disabled={pending}
      className={
        variant === 'primary'
          ? 'h-11 w-full rounded-sm bg-accent text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent-strong disabled:opacity-60'
          : 'h-11 w-full rounded-sm border border-line text-sm font-medium text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken disabled:opacity-60'
      }
    >
      {pending ? 'Memproses' : children}
    </button>
  )
}

export function LoginForm() {
  const [state, action] = useActionState(authenticate, EMPTY)

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-describedby={state.error ? 'auth-message' : undefined}
          aria-invalid={state.error ? true : undefined}
          className="h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent"
          placeholder="nama@email.com"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          Kata sandi
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm text-ink focus:border-accent"
        />
        <p className="text-xs text-ink-faint">Minimal 8 karakter.</p>
      </div>

      {/* Validation shows in place, never in an alert, and is announced. */}
      {state.error ?? state.notice ? (
        <p
          id="auth-message"
          role="status"
          aria-live="polite"
          className={
            state.error
              ? 'rounded-sm border border-over/30 bg-over-wash px-3 py-2 text-sm text-over'
              : 'rounded-sm border border-under/30 bg-under-wash px-3 py-2 text-sm text-under'
          }
        >
          {state.error ?? state.notice}
        </p>
      ) : null}

      <div className="space-y-2 pt-2">
        <Submit intent="signin" variant="primary">
          Masuk
        </Submit>
        <Submit intent="signup" variant="secondary">
          Buat akun baru
        </Submit>
      </div>
    </form>
  )
}
