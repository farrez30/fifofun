'use client'

import { useActionState, useState, useTransition, type ReactNode } from 'react'
import { CategoryMark } from '@/components/marks'
import { DragHandle, ReorderScope, useReorderRow } from '@/components/reorder'
import { formatIdr } from '@/lib/money'
import { LOOKED_UP_NAMES, arrangeRows, isLookedUpByName } from '@/lib/ledger/settings'
import { CASHFLOW_LABELS, CASHFLOW_TYPES, type CashflowType } from '@/lib/ledger/types'
import type { ActionResult } from '@/lib/actions'
import { reorderCategories, setCategoryArchived } from './actions'
import { CategoryForm } from './category-form'
import { useActionToast, withToast } from '@/components/use-action-toast'

/**
 * Every category, grouped by the direction it points.
 *
 * Grouped rather than listed flat because the cashflow is the one thing about a
 * category that cannot be changed later, so it is the thing a person has to see
 * before they add another one. A savings pot appears in two groups, once for
 * money going in and once for money coming back out, and acting on either row
 * acts on both.
 */

export interface CategoryView {
  id: string
  name: string
  cashflow: CashflowType
  /** The group it rolls up into, or empty when it is one or belongs to none. */
  parentId: string
  icon: string
  /** Degrees as text, or empty for the hue derived from the name. */
  hue: string
  /** One sentence saying what belongs here, or empty for none. */
  description: string
  /** A bill's monthly amount as sen digits, or empty when none was set. */
  billAmount: string
  /** A bill's due day as text, or empty. */
  billDueDay: string
  archived: boolean
  usage: number
}

export function CategoriesPanel({ categories }: { categories: CategoryView[] }) {
  const [editing, setEditing] = useState<string | null>(null)

  // A drop shows at once and is put back if the server refuses it.
  const [shown, setShown] = useState(categories)
  const [seen, setSeen] = useState(categories)
  if (categories !== seen) {
    setSeen(categories)
    setShown(categories)
  }
  const [, startTransition] = useTransition()

  function reorder(ids: string[]) {
    const arranged = arrangeRows(shown, ids)
    if (!arranged) return
    setShown(arranged)
    startTransition(async () => {
      const result = await withToast(reorderCategories(ids), 'Menyimpan urutan…').catch(() => null)
      if (!result?.ok) setShown(seen)
    })
  }

  const live = shown.filter((category) => !category.archived)
  const archived = shown.filter((category) => category.archived)

  /*
    Each group followed by what is inside it, so the list on screen reads the
    way the report does. Sorting alone would not do it: a group and its members
    are ordered by the household's own numbering, and a member can be numbered
    anywhere.
  */
  const arranged = (rows: CategoryView[]) => {
    const children = new Map<string, CategoryView[]>()
    for (const row of rows) {
      if (!row.parentId) continue
      children.set(row.parentId, [...(children.get(row.parentId) ?? []), row])
    }
    return rows
      .filter((row) => !row.parentId)
      .flatMap((row) => [row, ...(children.get(row.id) ?? [])])
      .concat(rows.filter((row) => row.parentId && !rows.some((other) => other.id === row.parentId)))
  }

  const groups = CASHFLOW_TYPES.map((cashflow) => ({
    cashflow,
    rows: arranged(live.filter((category) => category.cashflow === cashflow)),
  })).filter((group) => group.rows.length > 0)

  const reorderable = { onReorder: reorder, onDragStart: () => setEditing(null) }

  return (
    <section aria-labelledby="kategori" className="scroll-mt-8">
      <h2 id="kategori" className="text-title3 font-semibold tracking-title3 text-ink">
        Kategori
      </h2>
      <p className="mt-1 text-subhead text-ink-muted">
        {live.length} kategori aktif di {groups.length} cashflow
        {archived.length > 0 ? `, ${archived.length} diarsipkan` : ''}.
      </p>

      <div className="mt-3 space-y-6">
        {groups.map((group) => (
          <div key={group.cashflow}>
            <h3 className="text-subhead font-medium text-ink">{CASHFLOW_LABELS[group.cashflow]}</h3>
            <Table
              rows={group.rows}
              siblings={categories}
              editing={editing}
              onToggle={(id) => setEditing(editing === id ? null : id)}
              caption={`Kategori bercashflow ${CASHFLOW_LABELS[group.cashflow]}`}
              {...reorderable}
            />
          </div>
        ))}

        {archived.length > 0 ? (
          <div>
            <h3 className="text-subhead font-medium text-ink">Diarsipkan</h3>
            <Table
              rows={archived}
              siblings={categories}
              editing={editing}
              onToggle={(id) => setEditing(editing === id ? null : id)}
              caption="Kategori yang diarsipkan"
            />
          </div>
        ) : null}
      </div>


      <p className="mt-3 text-footnote text-ink-muted">
        Seret pegangan di kiri untuk mengubah urutan. Kelompok berpindah bersama isinya, dan isi
        sebuah kelompok hanya bisa diurutkan di dalam kelompok itu.
      </p>

      <p className="mt-3 text-footnote text-ink-muted">
        Cashflow menentukan arah uang dan ikut tersimpan di setiap transaksi bersama sisi akunnya,
        jadi tidak bisa diubah setelah kategorinya dipakai. Warna dan ikon hanya penanda: yang
        tersimpan cuma derajat warnanya, terangnya mengikuti tema.
      </p>

      <details className="mt-3 squircle rounded-md bg-surface shadow-xs">
        <summary className="cursor-pointer px-4 py-3 text-subhead text-ink-muted">
          Nama yang dicari impor apa adanya
        </summary>
        <div className="border-t border-line p-4">
          <ul className="flex flex-wrap gap-1.5">
            {LOOKED_UP_NAMES.map((name) => (
              <li
                key={name}
                className="rounded-xs border border-line bg-sunken px-1.5 py-0.5 text-footnote text-ink"
              >
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-footnote text-ink-muted">
            Kalau salah satu diganti nama, baris impor yang biasanya ke sana menunggu di Tinjau
            tanpa kategori. Itu bukan kerusakan, hanya pekerjaan tambahan sekali.
          </p>
        </div>
      </details>

      <details className="mt-3 squircle rounded-md bg-surface shadow-xs">
        <summary className="cursor-pointer px-4 py-3 text-subhead text-accent">Tambah kategori</summary>
        <div className="border-t border-line p-4">
          <CategoryForm siblings={categories} />
        </div>
      </details>
    </section>
  )
}

/** One block per top-level row, so the rule under it falls between blocks. */
const BODY = 'border-b border-line last:border-0'

/** A group's members, under the group's own card, with the tier's inset rule above them. */
const NESTED_LIST =
  "rows-inset relative before:absolute before:top-0 before:right-0 before:left-7 before:h-px before:bg-line before:content-['']"

interface TableProps {
  rows: CategoryView[]
  siblings: CategoryView[]
  editing: string | null
  onToggle: (id: string) => void
  caption: string
  /** Absent for the archived list, which has no order to change. */
  onReorder?: (ids: string[]) => void
  onDragStart?: () => void
}

/*
  Every run of siblings is its own scope: the groups and standalone rows under
  one heading, and then the members of each group. A group is drawn as one
  block (a tbody of its own, or a list item holding its members) so it moves
  with everything inside it. Folding the members away while a group was lifted
  was tried first: the table shrank under the pointer and the lifted row jumped
  out from under the finger by the height of every member above it.
*/
function Table({ rows, siblings, editing, onToggle, caption, onReorder, onDragStart }: TableProps) {
  const inList = new Set(rows.map((row) => row.id))
  const top = rows.filter((row) => !row.parentId || !inList.has(row.parentId))
  const membersOf = (id: string) => rows.filter((row) => row.parentId === id)
  const names = Object.fromEntries(rows.map((row) => [row.id, row.name]))
  const topSortable = Boolean(onReorder) && top.length > 1

  const common = (category: CategoryView) => ({
    category,
    siblings,
    isGroup: siblings.some((row) => row.parentId === category.id),
    open: editing === category.id,
    onToggle: () => onToggle(category.id),
  })

  function scope(ids: string[], children: ReactNode) {
    if (!onReorder || ids.length < 2) return children
    return (
      <ReorderScope ids={ids} names={names} onReorder={onReorder} onDragStart={onDragStart}>
        {children}
      </ReorderScope>
    )
  }

  function members(row: CategoryView, draw: (member: CategoryView, sortable: boolean) => ReactNode) {
    const list = membersOf(row.id)
    const sortable = Boolean(onReorder) && list.length > 1
    return scope(
      list.map((member) => member.id),
      list.map((member) => draw(member, sortable)),
    )
  }

  return (
    <>
      {/* One list per cashflow group, so this runs six times on the settings
          page and each one was its own sideways drag. */}
      <ul
        aria-label={caption}
        className="mt-2 rows-inset squircle rounded-md bg-surface shadow-xs sm:hidden"
      >
        {scope(
          top.map((row) => row.id),
          top.map((row) => {
            const inner =
              membersOf(row.id).length > 0 ? (
                <ul className={NESTED_LIST}>
                  {members(row, (member, sortable) =>
                    sortable ? (
                      <SortableCard key={member.id} {...common(member)} />
                    ) : (
                      <Card key={member.id} {...common(member)} />
                    ),
                  )}
                </ul>
              ) : null
            return topSortable ? (
              <SortableCard key={row.id} {...common(row)}>
                {inner}
              </SortableCard>
            ) : (
              <Card key={row.id} {...common(row)}>
                {inner}
              </Card>
            )
          }),
        )}
      </ul>

      <div className="relative mt-2 hidden overflow-x-auto squircle rounded-md bg-surface shadow-xs sm:block">
      <table className="w-full min-w-[34rem] border-collapse text-subhead">

        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-caption1 uppercase tracking-wide text-ink-faint">
            <th scope="col" className="w-0 py-2 pl-2 font-medium">
              <span className="sr-only">Urutan</span>
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Kategori
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Transaksi
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Aksi
            </th>
          </tr>
        </thead>
        {scope(
          top.map((row) => row.id),
          top.map((row) => {
            const inner = members(row, (member, sortable) =>
              sortable ? (
                <SortableRow key={member.id} {...common(member)} />
              ) : (
                <Row key={member.id} {...common(member)} />
              ),
            )
            return topSortable ? (
              <SortableBody key={row.id} {...common(row)}>
                {inner}
              </SortableBody>
            ) : (
              <tbody key={row.id} className={BODY}>
                <Row {...common(row)} />
                {inner}
              </tbody>
            )
          }),
        )}
      </table>
      </div>
    </>
  )
}


/** "Rp121.000 · tgl 5" for a bill with a schedule, null otherwise. */
function billSummary(category: CategoryView): string | null {
  if (category.cashflow !== 'bills') return null
  const parts = [
    category.billAmount ? formatIdr(BigInt(category.billAmount)) : null,
    category.billDueDay ? `tgl ${category.billDueDay}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

interface RowProps {
  category: CategoryView
  /** The whole household, so the edit form can offer the groups it may join. */
  siblings: CategoryView[]
  /** Something rolls up into this one, so it takes no transactions of its own. */
  isGroup: boolean
  open: boolean
  onToggle: () => void
  /**
   * Present when the row can be dragged. A group row carries only the handle:
   * the block around it is what moves.
   */
  reorder?: Pick<Reorder, 'handle'> & Partial<Reorder>
}

type Reorder = ReturnType<typeof useReorderRow>

function SortableRow(props: Omit<RowProps, 'reorder'>) {
  return <Row {...props} reorder={useReorderRow(props.category.id)} />
}

function SortableCard({ children, ...props }: Omit<RowProps, 'reorder'> & { children?: ReactNode }) {
  return (
    <Card {...props} reorder={useReorderRow(props.category.id)}>
      {children}
    </Card>
  )
}

function SortableBody({ children, ...props }: Omit<RowProps, 'reorder'> & { children: ReactNode }) {
  return (
    <Body {...props} reorder={useReorderRow(props.category.id)}>
      {children}
    </Body>
  )
}

function Body({ children, reorder, ...props }: RowProps & { children: ReactNode }) {
  return (
    <tbody ref={reorder?.ref} style={reorder?.style} className={`${BODY} ${reorder?.liftClass ?? ''}`}>
      <Row {...props} reorder={reorder ? { handle: reorder.handle } : undefined} />
      {children}
    </tbody>
  )
}

/** One category as a card, for a screen the table does not fit on. */
function Card({
  category,
  siblings,
  isGroup,
  open,
  onToggle,
  reorder,
  children,
}: RowProps & { children?: ReactNode }) {
  return (
    <li ref={reorder?.ref} style={reorder?.style} className={reorder?.liftClass}>
      {/* The indent is the tier: a category that rolls up into another sits
          under it here the same way it does in the table. */}
      <div className={`py-3 pr-3 ${category.parentId ? 'pl-7' : 'pl-3'} ${reorder ? '-ml-2' : ''}`}>
      <div className="flex items-center justify-between gap-1">
        {reorder ? (
          <DragHandle label={`Pindahkan ${category.name}`} handle={reorder.handle} />
        ) : null}
        <span className="min-w-0 flex-1 text-subhead text-ink">
          <CategoryMark
            name={category.name}
            cashflow={category.cashflow}
            icon={category.icon || null}
            hue={category.hue === '' ? null : Number(category.hue)}
            tile
          />
        </span>
        <span className="tnum shrink-0 font-mono text-footnote text-ink-muted">
          {category.usage} transaksi
        </span>
      </div>

      {category.description ? (
        <p className="mt-1 text-footnote text-ink-muted">{category.description}</p>
      ) : null}

      {billSummary(category) ? (
        <p className="tnum mt-1 text-footnote text-ink-muted">{billSummary(category)}</p>
      ) : null}

      {isLookedUpByName(category.name) || isGroup ? (
        <p className="mt-1 text-footnote text-ink-faint">
          {[
            isLookedUpByName(category.name) ? 'dicari impor' : null,
            isGroup ? 'kelompok, tidak menampung transaksi' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="h-11 flex-1 rounded-sm border border-line px-3 text-subhead text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
        >
          {open ? 'Tutup' : 'Ubah'}
        </button>
        <ArchiveButton category={category} />
      </div>

      {open ? (
        <div className="mt-3 border-t border-line pt-3">
          <CategoryForm category={category} siblings={siblings} />
        </div>
      ) : null}
      </div>
      {children}
    </li>
  )
}

function Row({ category, siblings, isGroup, open, onToggle, reorder }: RowProps) {
  return (
    <>
      <tr
        ref={reorder?.ref}
        style={reorder?.style}
        className={`border-b border-line last:border-0 ${reorder?.liftClass ?? ''}`}
      >
        <td className="w-0 py-1 pl-2">
          {reorder ? (
            <DragHandle label={`Pindahkan ${category.name}`} handle={reorder.handle} />
          ) : null}
        </td>
        <th
          scope="row"
          className={`py-2.5 pr-4 text-left font-normal text-ink ${
            category.parentId ? 'pl-9' : 'pl-4'
          }`}
        >
          <CategoryMark
            name={category.name}
            cashflow={category.cashflow}
            icon={category.icon || null}
            hue={category.hue === '' ? null : Number(category.hue)}
          />
          {isLookedUpByName(category.name) ? (
            <span className="ml-2 text-footnote text-ink-faint">dicari impor</span>
          ) : null}
          {isGroup ? (
            <span className="ml-2 text-footnote text-ink-faint">kelompok, tidak menampung transaksi</span>
          ) : null}
          {category.description ? (
            <span className="mt-0.5 block text-footnote font-normal text-ink-muted">
              {category.description}
            </span>
          ) : null}
          {billSummary(category) ? (
            <span className="tnum mt-0.5 block text-footnote font-normal text-ink-muted">
              {billSummary(category)}
            </span>
          ) : null}
        </th>
        <td className="tnum whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink-muted">
          {category.usage}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="h-9 rounded-sm border border-line px-2.5 text-footnote text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
            >
              {open ? 'Tutup' : 'Ubah'}
            </button>
            <ArchiveButton category={category} />
          </div>
        </td>
      </tr>

      {open ? (
        <tr className="border-b border-line bg-sunken last:border-0">
          <td colSpan={4} className="p-4">
            <CategoryForm category={category} siblings={siblings} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

function ArchiveButton({ category }: { category: CategoryView }) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(setCategoryArchived, null)
  useActionToast(result, pending)

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={category.id} />
      <input type="hidden" name="archived" value={category.archived ? '0' : '1'} />
      <button
        type="submit"
        className="h-9 rounded-sm border border-line px-2.5 text-footnote text-ink-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
      >
        {category.archived ? 'Pakai lagi' : 'Arsipkan'}
      </button>
    </form>
  )
}
