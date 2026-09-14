'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

/**
 * Whether the desktop sidebar is folded to a rail, remembered per device.
 *
 * A cookie rather than component state, for the same reason `theme` is one
 * (`src/app/pengaturan/actions.ts`, `setAppearance`): the shell renders on the
 * server, and every route-level `loading.tsx` has to draw the same width the
 * real page will settle on or a navigation reads as a reload.
 *
 * Its own file rather than a home in `pengaturan/actions.ts`, so that folding
 * the sidebar never drags Supabase or the settings schema into the loading
 * shells that render the toggle button.
 *
 * No authentication check, for the same reason `setAppearance` skips one: the
 * value is one of two strings, checked again wherever it is read, and grants
 * nothing. The worst a forged cookie buys is a narrower nav.
 */
export async function toggleSidebar(): Promise<void> {
  const store = await cookies()

  if (store.get('sidebar')?.value === 'collapsed') {
    store.delete('sidebar')
  } else {
    store.set('sidebar', 'collapsed', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    })
  }

  /* The width is stamped on <html> in the root layout, so the document that
     carries it has to be built again. */
  revalidatePath('/', 'layout')
}
