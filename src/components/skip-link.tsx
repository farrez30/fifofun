'use client'

/**
 * "Lompat ke konten", aware that there can be more than one konten.
 *
 * Under Cache Components a client navigation keeps departing pages mounted in
 * hidden Activity boundaries, so the document can hold several `main#main`
 * elements at once and a bare `href="#main"` resolves to whichever comes
 * first — often a hidden one, which silently does nothing. This keeps the
 * anchor (it still works without JavaScript, when there is exactly one page)
 * and, once hydrated, sends focus to the main that is actually on screen.
 * `offsetParent` is null inside a display:none subtree, which is exactly the
 * hidden-Activity case.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      onClick={(event) => {
        const mains = [...document.querySelectorAll<HTMLElement>('main#main')]
        const visible = mains.find((main) => main.offsetParent !== null)
        if (!visible) return
        event.preventDefault()
        visible.focus()
        visible.scrollIntoView()
      }}
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-accent focus:px-3 focus:py-2 focus:text-paper"
    >
      Lompat ke konten
    </a>
  )
}
