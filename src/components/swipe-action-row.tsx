'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { deleteEntry } from '@/app/catat/actions'
import { claimsDrag, releaseVerdict, trayOffset } from '@/components/swipe-actions'
import type { ActionResult } from '@/lib/actions'

/**
 * Swipe a ledger card left and its actions slide out from under it — the
 * convention every phone mail app has taught. Reveal-and-tap only: the swipe
 * can show a button, never press one. These rows are money, and the distance
 * at which a swipe would commit an action is also the distance a scroll
 * wobbles into by accident.
 *
 * The card and the tray both arrive server-rendered (children and `actions`),
 * so no bigint ever crosses into client props; this wrapper only moves what
 * it was given. The sums live in swipe-actions.ts with their own tests.
 *
 * `data-swipe-actions` is how the tab swipe knows to stand aside — its
 * `swipeActionAncestor` refusal looks for exactly this attribute. The tray is
 * a transform, not a real scroller, because the phone suite (rightly) fails
 * any transaction row that scrolls sideways.
 *
 * Ownership rules, for whoever adds the next tray: `touch-pan-y` on the
 * container keeps vertical scrolling native, `pointercancel` means the
 * browser took the gesture for that scroll and the tray simply closes, and a
 * tap anywhere on the card while any tray is open closes trays instead of
 * navigating — also the mail-app convention. One tray open at a time,
 * enforced through a module-level closer.
 */

let closeOpenTray: (() => void) | null = null

interface Props {
  /** The server-rendered actions, right-aligned, each its own >=44px target. */
  actions: React.ReactNode
  children: React.ReactNode
}

export function SwipeActionRow({ actions, children }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const trayRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  /** Width measured when the drag starts; the open transform reuses it. */
  const trayWidth = useRef(0)
  const drag = useRef<{ x: number; y: number; openAtStart: boolean; claimed: boolean } | null>(
    null,
  )
  const dragged = useRef(false)

  function applyTransform(px: number, animate: boolean) {
    const card = cardRef.current
    if (!card) return
    card.style.transition = animate ? '' : 'none'
    card.style.transform = px === 0 ? '' : `translateX(${px}px)`
  }

  function close() {
    setOpen(false)
    applyTransform(0, true)
    if (closeOpenTray === close) closeOpenTray = null
  }

  function openTray() {
    if (closeOpenTray && closeOpenTray !== close) closeOpenTray()
    closeOpenTray = close
    setOpen(true)
    applyTransform(-trayWidth.current, true)
  }

  function down(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return
    trayWidth.current = trayRef.current?.offsetWidth ?? 0
    if (trayWidth.current === 0) return
    drag.current = { x: event.clientX, y: event.clientY, openAtStart: open, claimed: false }
    dragged.current = false
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current
    if (!state) return

    const dx = event.clientX - state.x
    const dy = event.clientY - state.y

    if (!state.claimed) {
      const claim = claimsDrag(dx, dy)
      if (claim === null) return
      if (!claim) {
        // Mostly vertical: a scroll, never ours. Stop watching this pointer.
        drag.current = null
        return
      }
      state.claimed = true
      dragged.current = true
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // iOS throws for a pointer already released; the drag works uncaptured,
        // capture only smooths a finger that wanders off the row.
      }
    }

    applyTransform(trayOffset(dx, trayWidth.current, state.openAtStart), false)
  }

  function up(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current
    drag.current = null
    if (!state?.claimed) return

    const offset = trayOffset(
      event.clientX - state.x,
      trayWidth.current,
      state.openAtStart,
    )
    if (releaseVerdict(offset, trayWidth.current) === 'open') openTray()
    else close()
  }

  function cancel() {
    // The browser claimed the gesture for a scroll, so it was never ours.
    drag.current = null
    if (!open) applyTransform(0, true)
  }

  function clickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (dragged.current) {
      // The pointer that just dragged also produced a click; a swipe must
      // reveal, not navigate.
      event.preventDefault()
      event.stopPropagation()
      dragged.current = false
      return
    }
    if (open && trayRef.current && !trayRef.current.contains(event.target as Node)) {
      // A tap on the card while the tray is out puts the tray away.
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  /* A scroll while open reads as attention moving on. Once, passive. */
  useEffect(() => {
    if (!open) return
    const away = () => close()
    window.addEventListener('scroll', away, { once: true, passive: true })
    return () => window.removeEventListener('scroll', away)
    // `close` is stable enough here: it only touches refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div
      data-swipe-actions
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClickCapture={clickCapture}
      className="relative touch-pan-y overflow-hidden"
    >
      <div
        ref={trayRef}
        /* In the DOM after the card, so a keyboard reaches the card first and
           the tray second; visually underneath until the card slides. */
        onFocusCapture={() => {
          if (!open) {
            trayWidth.current = trayRef.current?.offsetWidth ?? 0
            openTray()
          }
        }}
        className="absolute inset-y-0 right-0 flex"
      >
        {actions}
      </div>
      <div ref={cardRef} className="relative bg-surface transition-transform duration-150">
        {children}
      </div>
    </div>
  )
}

/**
 * The tray's delete button: the same soft delete the detail page offers, one
 * tap closer. `deleteEntry` refuses bank rows on the server regardless, so
 * the tray only shows this where `editableFields` says removal is real.
 */
export function TrayDelete({ id, description }: { id: string; description: string }) {
  const [, action] = useActionState<ActionResult | null, FormData>(deleteEntry, null)

  return (
    <form action={action} className="flex">
      <input type="hidden" name="transactionId" value={id} />
      <TrayDeleteButton description={description} />
    </form>
  )
}

function TrayDeleteButton({ description }: { description: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Hapus ${description}`}
      className="flex h-full min-w-20 items-center justify-center border-l border-over/40 bg-over-wash px-4 text-sm font-medium text-ink disabled:opacity-50"
    >
      {pending ? 'Menghapus' : 'Hapus'}
    </button>
  )
}
