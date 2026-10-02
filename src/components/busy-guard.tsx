'use client'

import { useEffect } from 'react'

/**
 * Refuses a second submit while a form is still waiting on its first.
 *
 * Buttons used to be `disabled` while their action ran, which stopped the
 * double press and also threw keyboard focus back to the top of the page:
 * a disabled element cannot hold focus. They now only carry `aria-busy`, and
 * this one listener does the refusing for every form at once. It sits on the
 * window in the capture phase, ahead of React's own listener on the root, so
 * the action never hears the second press.
 */
export function BusyGuard() {
  useEffect(() => {
    const refuse = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement
      if (!form.querySelector('button[aria-busy="true"]')) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('submit', refuse, true)
    return () => window.removeEventListener('submit', refuse, true)
  }, [])

  return null
}
