'use client'

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

/**
 * A row of slots you can drag a marker along.
 *
 * Built for charts whose x axis is a small ordered set, a run of calendar years
 * or months, rather than a continuous range. Snapping to real slots is the point:
 * a birth year between 2028 and 2029 does not exist, and a slider that lets you
 * aim at one is lying about what it controls.
 *
 * Geometry lives in the container rather than in each marker, because the marker
 * has to agree with the columns above it. Those columns are flex children of
 * equal width, so slot `i` is centred at `(i + 0.5) / n` and nowhere else. A
 * marker computing its own position from a min and a max would sit half a column
 * off at both ends, which reads as a rounding bug and is really a layout one.
 *
 * Everything a pointer can do here, a keyboard can do too. Dragging is a
 * pleasant way to explore a projection and it cannot be the only way, so each
 * marker is a real `slider` with arrow keys, Home, End and page steps.
 */

/**
 * What the axis looked like at a given moment: its slots and its box.
 *
 * Captured when a drag starts and used for the rest of that gesture. Both halves
 * move while you drag: the marker changes a projection, the projection changes
 * which years exist, and the track resizes to fit them. Reading live geometry
 * mid-gesture means the marker chases a target that keeps moving, which lands
 * several years away from where the finger is pointing and feels like elastic.
 * Freezing both makes the gesture mean what it looked like when it began.
 */
interface Snapshot {
  values: number[]
  box: DOMRect
}

interface Geometry {
  values: number[]
  /** Where a value sits, as a fraction of the track's width. */
  fractionOf: (value: number) => number
  /** The axis as it stands right now, or null before it has been laid out. */
  snapshot: () => Snapshot | null
  /** The value under a viewport x coordinate, snapped to a slot of `frame`. */
  valueIn: (clientX: number, frame: Snapshot) => number
  /** Moves `value` by `steps` slots, stopping at the ends. */
  shift: (value: number, steps: number) => number
}

const AxisContext = createContext<Geometry | null>(null)

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/**
 * Where slot `index` of `count` sits, as a fraction of the track.
 *
 * The centre, not the leading edge. The columns above are flex children of
 * equal width, so the first one occupies 0 to 1/n and its middle is at 0,5/n.
 * Dividing by `count - 1` instead, which is the reflex for a slider, puts the
 * first marker hard against the left edge and the last one past the right, and
 * reads as an off-by-one in the data rather than in the layout.
 */
export function slotFraction(index: number, count: number): number {
  if (count <= 0) return 0
  return (clamp(index, 0, count - 1) + 0.5) / count
}

/** Which slot a viewport x lands in, given the track's left edge and width. */
export function slotAt(clientX: number, left: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return 0
  return clamp(Math.floor(((clientX - left) / width) * count), 0, count - 1)
}

interface AxisProps {
  /** The ordered slot values, one per column, matching the chart above. */
  values: number[]
  children: ReactNode
  className?: string
}

export function DragAxis({ values, children, className = '' }: AxisProps) {
  const track = useRef<HTMLDivElement>(null)

  const indexOf = useCallback(
    (value: number) => {
      const found = values.indexOf(value)
      if (found >= 0) return found
      // A value off the end of the drawn range still needs somewhere to sit, or
      // the marker disappears and the reader assumes the control is broken.
      return value < (values[0] ?? 0) ? 0 : values.length - 1
    },
    [values],
  )

  const geometry: Geometry = {
    values,
    fractionOf: (value) => slotFraction(indexOf(value), values.length),
    snapshot: () => {
      const box = track.current?.getBoundingClientRect()
      if (!box || box.width === 0 || values.length === 0) return null
      return { values, box }
    },
    valueIn: (clientX, frame) =>
      frame.values[slotAt(clientX, frame.box.left, frame.box.width, frame.values.length)],
    shift: (value, steps) => values[clamp(indexOf(value) + steps, 0, values.length - 1)],
  }

  return (
    <AxisContext.Provider value={geometry}>
      <div ref={track} className={`relative ${className}`}>
        {children}
      </div>
    </AxisContext.Provider>
  )
}

interface PinProps {
  value: number
  onChange: (value: number) => void
  /** Named for a screen reader, e.g. "Tahun lahir Anak pertama". */
  label: string
  /** How the value is spoken and shown. Defaults to the number itself. */
  format?: (value: number) => string
  /** Fill for the marker, usually the series colour it belongs to. */
  color?: string
  /** How many slots a page step moves. */
  pageStep?: number
}

export function DragPin({
  value,
  onChange,
  label,
  format = String,
  color = 'var(--color-accent)',
  pageStep = 5,
}: PinProps) {
  const context = useContext(AxisContext)
  const [dragging, setDragging] = useState(false)
  /** The axis as it stood when this gesture began. Null when not dragging. */
  const grabbed = useRef<Snapshot | null>(null)

  if (!context) throw new Error('DragPin must be rendered inside a DragAxis')
  // Re-bound so the handlers below close over a value the compiler knows is
  // present, rather than one narrowed at a point they were not created at.
  const axis = context

  function move(next: number) {
    if (next !== value) onChange(next)
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    const frame = axis.snapshot()
    if (!frame) return

    grabbed.current = frame
    setDragging(true)

    /*
      Capture keeps a fast drag that outruns the pointer sending its events here
      rather than to whatever is underneath. It is an improvement, not a
      requirement, and it throws when the pointer is already gone. Letting that
      throw escape aborts the handler and the marker never moves at all, which
      is a far worse failure than a drag that loses the pointer at the edges.
    */
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Nothing to do: the gesture still works, it is just less forgiving.
    }

    move(axis.valueIn(event.clientX, frame))
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const frame = grabbed.current
    if (!frame) return
    move(axis.valueIn(event.clientX, frame))
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Already released by the browser. Nothing left to undo.
    }
    grabbed.current = null
    setDragging(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -pageStep,
      PageUp: pageStep,
    }

    if (event.key === 'Home') {
      event.preventDefault()
      move(axis.values[0])
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      move(axis.values[axis.values.length - 1])
      return
    }

    const step = steps[event.key]
    if (step === undefined) return
    event.preventDefault()
    move(axis.shift(value, step))
  }

  const style: CSSProperties = {
    left: `${axis.fractionOf(value) * 100}%`,
    // Only animated when something other than a finger moved it. Easing a
    // marker towards the pointer during a drag reads as lag, not as polish.
    transitionProperty: dragging ? 'none' : 'left',
    transitionDuration: '120ms',
    transitionTimingFunction: 'ease-out',
  }

  return (
    <button
      type="button"
      role="slider"
      aria-label={label}
      aria-valuemin={axis.values[0]}
      aria-valuemax={axis.values[axis.values.length - 1]}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      // `touch-none` stops the browser claiming the gesture as a scroll, which
      // on a phone otherwise makes the marker impossible to drag at all.
      className="absolute top-0 flex -translate-x-1/2 cursor-grab touch-none flex-col items-center px-3 py-1 active:cursor-grabbing"
      style={style}
    >
      <span
        aria-hidden="true"
        className="block size-3 rotate-45 border border-paper"
        style={{ backgroundColor: color }}
      />
      <span className="tnum mt-1 font-mono text-[0.625rem] leading-none text-ink">
        {format(value)}
      </span>
    </button>
  )
}
