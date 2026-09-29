'use client'

import { CheckCircle } from '@phosphor-icons/react/dist/ssr/CheckCircle'
import { CircleNotch } from '@phosphor-icons/react/dist/ssr/CircleNotch'
import { WarningCircle } from '@phosphor-icons/react/dist/ssr/WarningCircle'
import { Toaster as Sonner } from 'sonner'
import 'sonner/dist/styles.css'

/**
 * Where every save says it is saving, and then whether it worked.
 *
 * Mounted once in the root layout. Forms reach it through `useActionToast`,
 * never by rendering their own, so there is one live region for the whole app
 * and a screen reader hears each outcome once.
 *
 * The stylesheet is imported here rather than injected: sonner writes a
 * `<style>` tag at runtime, which the production CSP refuses for lack of a
 * nonce, so that call is patched out (patches/sonner@2.0.8.patch) and the same
 * CSS ships in the app's own bundle, which `'self'` allows. The colours come
 * from the theme tokens in globals.css (`[data-sonner-toaster]`), and a toast
 * is chrome floating over content, so it is glass like the bars are.
 */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      closeButton
      visibleToasts={3}
      containerAriaLabel="Notifikasi"
      icons={{
        success: <CheckCircle aria-hidden="true" weight="fill" className="size-5 text-under" />,
        error: <WarningCircle aria-hidden="true" weight="fill" className="size-5 text-over" />,
        loading: <CircleNotch aria-hidden="true" weight="bold" className="size-5 animate-spin text-ink-muted" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'material squircle font-sans',
          title: 'text-subhead font-medium',
          description: 'text-footnote',
        },
      }}
    />
  )
}
