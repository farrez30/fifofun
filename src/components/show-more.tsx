'use client'

import { useId, useState } from 'react'
import { BUTTON_PLAIN } from '@/components/field-base'

/**
 * The first few of a list, and one button for the rest.
 *
 * For lists that are work to get through (pairs to settle, rules to prune),
 * where hiding the tail behind a link to another page would hide the work
 * itself. The button always says how many it is holding back, so nothing is
 * ever silently out of view. Lists that have a page of their own link to it
 * instead (Catat links to Laporan); this is for the ones that do not.
 *
 * `listId` goes on the list itself, so the button can say which list it opens.
 */

export function useShowMore<T>(items: readonly T[], first: number) {
  const [all, setAll] = useState(false)
  const listId = useId()
  return {
    shown: all ? items : items.slice(0, first),
    listId,
    button:
      items.length > first ? (
        <button
          type="button"
          aria-expanded={all}
          aria-controls={listId}
          onClick={() => setAll(!all)}
          className={BUTTON_PLAIN}
        >
          {all ? 'Tampilkan lebih sedikit' : `Tampilkan ${items.length - first} lainnya`}
        </button>
      ) : null,
  }
}
