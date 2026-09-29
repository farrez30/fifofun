'use client'

import { useId, type CSSProperties, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DotsSixVertical } from '@phosphor-icons/react/dist/ssr/DotsSixVertical'

/**
 * A list a person can put in their own order by dragging a handle.
 *
 * This replaced a pair of arrow buttons per row, which were chosen because
 * drag is "a gesture a keyboard does not have". The keyboard sensor answers
 * that: focus the handle, Space to lift, arrows to move, Space to drop, Escape
 * to put it back. Every step is announced in Indonesian, because dnd-kit's own
 * announcements are English and this app is not.
 *
 * Only the handle starts a drag. A row carries buttons, links and, when open,
 * a whole form, and a drag that could start anywhere would fight every one of
 * them for the same pointer.
 *
 * One scope is one run of siblings. Scopes nest (a group's members inside the
 * list of groups) without seeing each other, so a member can never be dropped
 * among the groups, which is a move the data does not allow anyway.
 */

/** Rows only ever move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

interface ScopeProps {
  ids: string[]
  /** What each row is called, for the screen reader. */
  names: Record<string, string>
  onReorder: (ids: string[]) => void
  onDragStart?: (id: string) => void
  onDragEnd?: () => void
  children: ReactNode
}

export function ReorderScope({ ids, names, onReorder, onDragStart, onDragEnd, children }: ScopeProps) {
  // dnd-kit numbers its screen-reader ids from a module counter, which the
  // server and the browser reach at different counts; React's id agrees.
  const id = useId()
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const name = (id: UniqueIdentifier) => names[String(id)] ?? 'Baris'
  const place = (id: UniqueIdentifier) => `urutan ${ids.indexOf(String(id)) + 1} dari ${ids.length}`

  const announcements: Announcements = {
    onDragStart: ({ active }) => `${name(active.id)} diangkat, di ${place(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${name(active.id)} dipindah ke ${place(over.id)}.` : `${name(active.id)} di luar daftar.`,
    onDragEnd: ({ active, over }) =>
      over ? `${name(active.id)} diletakkan di ${place(over.id)}.` : `${name(active.id)} diletakkan.`,
    onDragCancel: ({ active }) => `Batal. ${name(active.id)} kembali ke tempatnya.`,
  }

  function end({ active, over }: DragEndEvent) {
    onDragEnd?.()
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    const next = [...ids]
    next.splice(to, 0, ...next.splice(from, 1))
    onReorder(next)
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragStart={({ active }) => onDragStart?.(String(active.id))}
      onDragEnd={end}
      onDragCancel={() => onDragEnd?.()}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Tekan spasi untuk mengangkat. Pakai panah atas dan bawah untuk memindahkan, spasi lagi untuk meletakkan, atau Escape untuk batal.',
        },
        // The live region is a div, and a scope can sit inside a tbody.
        container: typeof document === 'undefined' ? undefined : document.body,
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

/** The row half of a sortable: where it is drawn, and what its handle needs. */
export function useReorderRow(id: string, disabled = false) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled, transition: { duration: 250, easing: 'var(--ease-snappy)' } })

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  return {
    ref: setNodeRef,
    style,
    isDragging,
    /* Lifted, a row is raised the way the elevation scale says a row may be,
       and drawn above its neighbours so the one it passes does not cover it. */
    liftClass: isDragging ? 'relative z-10 bg-surface shadow-sm' : '',
    handle: { ref: setActivatorNodeRef, ...attributes, ...listeners },
  }
}

export function DragHandle({
  label,
  handle,
}: {
  label: string
  handle: ReturnType<typeof useReorderRow>['handle']
}) {
  return (
    <button
      type="button"
      aria-label={label}
      {...handle}
      /* touch-none, or a phone scrolls the page instead of lifting the row. */
      className="inline-flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-ink-faint transition-colors duration-150 hover:bg-sunken hover:text-ink active:cursor-grabbing"
    >
      <DotsSixVertical aria-hidden="true" weight="bold" className="size-5" />
    </button>
  )
}
