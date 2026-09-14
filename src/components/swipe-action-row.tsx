'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { deleteEntry } from '@/app/catat/actions'
import { claimsDrag, releaseVerdict, trayOffset } from '@/components/swipe-actions'
import { TRAY, Velocity, release, translateOf } from '@/components/spring'
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
  const velocity = useRef(new Velocity())
  /* The spring carrying the card, so a finger landing on a moving one takes it
     over rather than fighting it. */
  const running = useRef<Animation | null>(null)

  function applyTransform(px: number, animate: boolean) {
    const card = cardRef.current
    if (!card) return
    card.style.transition = animate ? '' : 'none'
    card.style.transform = px === 0 ? '' : `translateX(${px}px)`
  }

  /**
   * Spring the card from where it is to where it is going.
   *
   * Critically damped, and that is not a matter of taste. The tray is
   * `absolute inset-y-0 right-0` inside a clipped container, so an overshoot at
   * either end opens a gap and shows the page through it: past open, a band
   * between the card and the tray; past closed, a band on the left. A delete
   * button that bounces is also the wrong register for money.
   */
  function springCard(to: number, speed: number) {
    const card = cardRef.current
    if (!card) return
    running.current?.cancel()
    card.style.transition = 'none'
    running.current = release(card, TRAY, {
      from: translateOf(card, 'x'),
      to,
      velocity: speed,
    }, 'x')
  }

  function close(speed = 0) {
    setOpen(false)
    springCard(0, speed)
    if (closeOpenTray === close) closeOpenTray = null
  }

  function openTray(speed = 0) {
    if (closeOpenTray && closeOpenTray !== close) closeOpenTray()
    closeOpenTray = close
    setOpen(true)
    /*
      One tick where the tray commits, and nowhere else.

      There is no Vibration API in any browser on iOS and there never has been,
      so this is Android only; it is here because the application is Indonesian
      and the modal device is Android, which inverts the coverage argument that
      usually kills haptics on the web. Not on the drag, not on the close, not
      on a tap: a buzz on the way to deleting a transaction reads as an alarm
      rather than as confirmation, and haptic spam is its own anti-pattern.
    */
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate(10)
    }
    springCard(-trayWidth.current, speed)
  }

  function down(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return
    /* Take the card over from wherever it is. The position is read before the
       animation is cancelled, because cancelling reverts to the base style;
       the velocity is thrown away, because from this frame the finger owns
       it. */
    running.current?.cancel()
    running.current = null
    velocity.current.start(event.clientX, event.timeStamp)
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

    velocity.current.track(event.clientX, event.timeStamp)
    applyTransform(trayOffset(dx, trayWidth.current, state.openAtStart), false)
  }

  function up(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current
    drag.current = null
    if (!state?.claimed) return

    velocity.current.track(event.clientX, event.timeStamp)
    const speed = velocity.current.current
    const offset = trayOffset(
      event.clientX - state.x,
      trayWidth.current,
      state.openAtStart,
    )
    if (releaseVerdict(offset, trayWidth.current, speed) === 'open') openTray(speed)
    else close(speed)
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
      {/* No transition on the card. It used to carry a flat 150ms, which is
          what made a hard flick and a gentle nudge travel at identical speed;
          the spring that replaced it is generated per release and applied
          through the Web Animations API. */}
      <div ref={cardRef} className="relative bg-surface">
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
      className="flex h-full min-w-20 items-center justify-center border-l border-over/40 bg-over-wash px-4 text-subhead font-medium text-ink disabled:opacity-50"
    >
      {pending ? 'Menghapus' : 'Hapus'}
    </button>
  )
}
