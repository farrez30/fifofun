import { cookies } from 'next/headers'
import { Moon } from '@phosphor-icons/react/dist/ssr/Moon'
import { Sun } from '@phosphor-icons/react/dist/ssr/Sun'
import { Check } from '@phosphor-icons/react/dist/ssr/Check'
import { Circle } from '@phosphor-icons/react/dist/ssr/Circle'
import { setAppearance } from './actions'

/**
 * Light, dark, or whatever the phone is set to.
 *
 * Apple's model is that appearance is the reader's to choose rather than the
 * operating system's to dictate, and this application had no way to say so: the
 * palette followed `prefers-color-scheme` and nothing else. Somebody who reads
 * a ledger in bed on a phone locked to light mode had no recourse.
 *
 * Three options and not a two-state switch, because "follow the system" is a
 * real answer and the most common one. A switch would force a choice nobody
 * asked to make and then stop tracking the phone's own schedule.
 *
 * The mechanism is a cookie read server side in `layout.tsx`, not
 * `localStorage` behind an inline script. The reasoning is written there; the
 * short version is that the content security policy is nonce based, the layout
 * already renders per request, and a cookie costs no script, cannot flash the
 * wrong theme, and survives JavaScript being off. Which is why this is three
 * form buttons rather than a client component.
 */

const OPTIONS = [
  {
    value: 'system',
    label: 'Ikuti sistem',
    glyph: Circle,
    hint: 'Berubah sendiri saat HP berganti mode.',
  },
  { value: 'light', label: 'Terang', glyph: Sun, hint: 'Kertas terang, tinta gelap.' },
  { value: 'dark', label: 'Gelap', glyph: Moon, hint: 'Latar hitam, tinta terang.' },
] as const

export async function Appearance() {
  const chosen = (await cookies()).get('theme')?.value ?? 'system'
  const current = chosen === 'light' || chosen === 'dark' ? chosen : 'system'

  return (
    <section aria-labelledby="tampilan" className="space-y-3">
      <div>
        <h2 id="tampilan" className="text-title3 font-semibold tracking-title3 text-ink">
          Tampilan
        </h2>
        <p className="mt-1 text-subhead text-ink-muted">
          Berlaku di perangkat ini saja. Anggota rumah tangga lain memilih sendiri.
        </p>
      </div>

      <ul className="rows-inset squircle rounded-md bg-surface shadow-xs">
        {OPTIONS.map((option) => {
          const active = option.value === current

          return (
            <li key={option.value}>
              <form action={setAppearance}>
                <input type="hidden" name="theme" value={option.value} />
                {/*
                  A row, not a radio in a list of radios. The whole row is the
                  target, which is what a grouped list does on iOS and what a
                  thumb expects; the checkmark on the right is the state.
                */}
                <button
                  type="submit"
                  aria-current={active ? 'true' : undefined}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-150 active:bg-fill-quaternary"
                >
                  <option.glyph
                    aria-hidden="true"
                    weight={active ? 'fill' : 'regular'}
                    className={`size-5 shrink-0 ${active ? 'text-accent' : 'text-ink-faint'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-subhead text-ink">{option.label}</span>
                    <span className="block text-footnote text-ink-muted">{option.hint}</span>
                  </span>
                  {/*
                    A tick rather than a colour, and the word beside it for a
                    reader who hears the row rather than sees it. The same rule
                    the money colours follow: never hue alone.
                  */}
                  {active ? (
                    <span className="shrink-0 text-accent">
                      <Check aria-hidden="true" weight="bold" className="size-5" />
                      <span className="sr-only">dipakai sekarang</span>
                    </span>
                  ) : null}
                </button>
              </form>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
