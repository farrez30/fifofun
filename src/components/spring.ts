'use client'

/**
 * Apple's spring, solved at the moment the finger lifts.
 *
 * A CSS transition always starts from rest, and that single fact is why web
 * gestures feel dead next to the operating system underneath them: the sheet
 * you flicked and the sheet you nudged travel at exactly the same speed. A
 * spring does not have that problem, because release velocity is just the
 * initial condition of a differential equation that has a closed form. So the
 * answer is not to run an integrator sixty times a second in JavaScript; it is
 * to solve the curve once, on `pointerup`, and hand it to the compositor.
 *
 * The Web Animations API rather than a `requestAnimationFrame` loop, for three
 * reasons that are specific to this application rather than to taste.
 *
 * The compositor runs it, and every gesture here ends in a router call that
 * occupies the main thread at precisely the moment the animation starts.
 *
 * `document.getAnimations()` can see it, and that is what the phone suite waits
 * on before it measures contrast or geometry. A loop writing `style.transform`
 * is invisible there, so axe would start sampling frames from the middle of a
 * gesture, which is the bug that comment in `mobile.spec.ts` was written about.
 *
 * And there is no loop left running inside a hidden Activity. Cache Components
 * keeps a departing page mounted rather than unmounting it, and this repository
 * has already shipped that bug twice: once with a dialog that stayed open and
 * once with a scroll listener that stayed attached. A `linear()` curve on an
 * element nobody can see simply stops.
 *
 * What this deliberately does not do is absorb velocity mid-flight. When a
 * finger lands on a sheet that is still moving, the position is read and the
 * animation is cancelled, and the velocity is thrown away: from that frame the
 * finger owns it. That is what iOS does, and recognising it is what removes the
 * need for an integrator at all.
 */

export interface Spring {
  /** Seconds for one oscillation. Lower is faster. */
  response: number
  /** 1 settles without overshooting; below 1 bounces. */
  damping: number
}

/**
 * The sheet going away. Brisker than the one that brought it in, because a
 * dismissal is an answer and an arrival is an introduction.
 */
export const SHEET_OUT: Spring = { response: 0.4, damping: 0.88 }

/**
 * A row action tray, and the card that covers it.
 *
 * Critically damped, and not because a bounce would look wrong. The tray is
 * `absolute inset-y-0 right-0` inside a clipped container, so an overshoot past
 * either end opens a gap and shows the page through it. A delete button that
 * bounces is also the wrong emotional register for money.
 */
export const TRAY: Spring = { response: 0.3, damping: 1 }

/** Anything returning to where it started, having been refused. */
export const RETURN: Spring = { response: 0.35, damping: 1 }

/**
 * UIScrollView's deceleration rate, per millisecond.
 *
 * The normal rate for something that travels the height of the screen; 0.99,
 * the "fast" rate, for something that travels eighty or a hundred pixels, where
 * the normal one would turn every nudge into a commit.
 */
export const DECELERATION = 0.998

/**
 * Normalised displacement, where `u(0) = 1`, `u(∞) = 0` and `u′(0) = v0`.
 *
 * `v0` is per second, relative to the distance still to travel, which is what
 * makes the same spring usable for a four pixel snap and a four hundred pixel
 * dismissal without retuning.
 */
function solve({ response, damping }: Spring, v0: number): (t: number) => number {
  const w0 = (2 * Math.PI) / response

  if (damping >= 1) {
    const b = v0 + w0
    return (t) => Math.exp(-w0 * t) * (1 + b * t)
  }

  const wd = w0 * Math.sqrt(1 - damping * damping)
  const b = (v0 + damping * w0) / wd
  return (t) => Math.exp(-damping * w0 * t) * (Math.cos(wd * t) + b * Math.sin(wd * t))
}

export interface Travel {
  from: number
  to: number
  /** Pixels per millisecond, signed in page coordinates. */
  velocity: number
}

/**
 * The easing and duration for one release.
 *
 * Settles when it is within half a pixel of home, so the duration is measured
 * rather than guessed, and a four pixel correction does not run for as long as
 * a four hundred pixel one.
 *
 * Twenty stops. The piecewise-linear error against the exact curve stays under
 * two percent of the travel at that count, which is six pixels on a full-height
 * sheet and invisible on anything smaller.
 */
export function springTo(spring: Spring, { from, to, velocity }: Travel) {
  const travel = from - to
  if (Math.abs(travel) < 0.5) return { easing: 'linear', duration: 0 }

  const u = solve(spring, (velocity * 1000) / travel)
  const settled = 0.5 / Math.abs(travel)

  let end = 0
  for (let step = 0; step < 2000; step += 1) {
    if (Math.abs(u(step / 1000)) > settled) end = step / 1000
  }
  end += 0.001

  const stops = Array.from({ length: 21 }, (_, at) => 1 - u((end * at) / 20))
  stops[0] = 0
  stops[20] = 1

  return {
    easing: `linear(${stops.map((value) => Number(value.toFixed(4))).join(', ')})`,
    duration: Math.round(end * 1000),
  }
}

/**
 * Where a flick is heading, rather than where the finger stopped.
 *
 * The whole of Apple's snapping decision is this one number. A geometric decay
 * at rate `r` sums to `v·r/(1−r)`, which at the normal rate is 499 milliseconds
 * of the release velocity. It is why flicking a sheet thirty pixels dismisses
 * it while dragging it slowly a hundred and twenty and stopping does not: the
 * second one is a cancellation, and a threshold measured in distance alone
 * cannot tell the two apart.
 */
export function endpoint(offset: number, velocity: number, rate = DECELERATION): number {
  return offset + (velocity * rate) / (1 - rate)
}

/**
 * Apple's overscroll curve.
 *
 * `past` is how far the finger has gone beyond the bound, `size` the dimension
 * it is pulling against, and the result asymptotes at `size` rather than being
 * clipped, so the surface decelerates into its limit instead of hitting a wall.
 *
 * Worth knowing before changing the constants anywhere that calls this: the
 * pull-to-refresh threshold in this application already sits on this curve. Its
 * 72px commit at half resistance is `b(144, 812) = 72,16`, which is the same
 * 144px of finger travel, and the test that asserts 143 is short and 144 is
 * enough passes against either formula. The linear version only diverges past
 * about two hundred pixels of pull, which the ceiling already clipped. The
 * change buys the last of the feel, not correctness.
 */
export function rubberBand(past: number, size: number): number {
  return (1 - 1 / ((past * 0.55) / size + 1)) * size
}

/**
 * Velocity in pixels per millisecond, from samples at least 8ms apart.
 *
 * One frame's delta on a 120Hz screen is eight milliseconds of noise rather
 * than a measurement, and a threshold built on it fires on a tremor. Pointer
 * events carry `timeStamp` on the same clock as `performance.now()`, so this
 * costs nothing beyond the arithmetic.
 */
export class Velocity {
  private at = 0
  private when = 0
  private speed = 0

  start(position: number, time: number): void {
    this.at = position
    this.when = time
    this.speed = 0
  }

  track(position: number, time: number): void {
    const elapsed = time - this.when
    if (elapsed < 8) return
    this.speed = (position - this.at) / elapsed
    this.at = position
    this.when = time
  }

  get current(): number {
    return this.speed
  }
}

/** The translate an element is currently painted at, for a finger landing on
    something that has not finished moving. */
export function translateOf(node: Element, axis: 'x' | 'y'): number {
  const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform)
  return axis === 'x' ? matrix.m41 : matrix.m42
}

/**
 * Whether this reader asked for less motion.
 *
 * Checked in JavaScript because no CSS block reaches a `element.animate()`
 * call. The reduced-motion rules in `globals.css` collapse the spring easings
 * that markup uses, and they cannot touch a curve generated at runtime; without
 * this the gesture springs would quietly come back for exactly the people who
 * turned them off.
 */
export function prefersCalm(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Run one release, and resolve when it lands.
 *
 * Returns the animation so a finger arriving mid-flight can cancel it. Under a
 * stated preference for less motion the element simply arrives, which is the
 * honest translation: the spring was carrying the velocity, and someone who
 * asked for calm did not ask to lose where the thing ended up.
 */
export function release(
  node: HTMLElement,
  spring: Spring,
  travel: Travel,
  axis: 'x' | 'y' = 'y',
): Animation | null {
  const at = (value: number) =>
    axis === 'y' ? `translateY(${value}px)` : `translateX(${value}px)`

  if (prefersCalm()) {
    node.style.transform = travel.to === 0 ? '' : at(travel.to)
    return null
  }

  const { easing, duration } = springTo(spring, travel)
  if (duration === 0) {
    node.style.transform = travel.to === 0 ? '' : at(travel.to)
    return null
  }

  const animation = node.animate(
    [{ transform: at(travel.from) }, { transform: at(travel.to) }],
    { duration, easing, fill: 'both' },
  )

  animation.finished
    .then(() => {
      node.style.transform = travel.to === 0 ? '' : at(travel.to)
      animation.cancel()
    })
    .catch(() => undefined)

  return animation
}
