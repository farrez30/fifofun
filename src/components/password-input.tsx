'use client'

import { useState, type ComponentProps } from 'react'
import { Eye } from '@phosphor-icons/react/dist/ssr/Eye'
import { EyeSlash } from '@phosphor-icons/react/dist/ssr/EyeSlash'

type Props = Omit<ComponentProps<'input'>, 'type'>

/**
 * A password field with an eye button, for checking what a password manager
 * just pasted. Every other attribute reaches the input untouched, so
 * `autoComplete` and `name` still tell the browser and the manager what this
 * field is. The button sits over the right padding of whatever class the
 * caller passes, and is the same 44px as `CONTROL` is tall.
 */
export function PasswordInput({ className = '', ...input }: Props) {
  const [shown, setShown] = useState(false)

  return (
    <div className="relative">
      <input
        {...input}
        type={shown ? 'text' : 'password'}
        // A shown password must not end up in the keyboard's dictionary.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        aria-label={shown ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
        aria-pressed={shown}
        // Keeps focus, and the phone keyboard, in the field on a tap.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setShown((value) => !value)}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-sm text-ink-muted hover:text-ink"
      >
        {shown ? (
          <EyeSlash aria-hidden="true" className="size-5" />
        ) : (
          <Eye aria-hidden="true" className="size-5" />
        )}
      </button>
    </div>
  )
}
