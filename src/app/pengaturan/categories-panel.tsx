'use client'

import { useActionState, useState } from 'react'
import { CategoryMark } from '@/components/marks'
import { LOOKED_UP_NAMES, isLookedUpByName } from '@/lib/ledger/settings'
import { CASHFLOW_LABELS, CASHFLOW_TYPES, type CashflowType } from '@/lib/ledger/types'
import type { ActionResult } from '@/lib/actions'
import { moveCategory, setCategoryArchived } from './actions'
import { CategoryForm } from './category-form'

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
  icon: string
  /** Degrees as text, or empty for the hue derived from the name. */
  hue: string
  archived: boolean
  usage: number
}

export function CategoriesPanel({ categories }: { categories: CategoryView[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const live = categories.filter((category) => !category.archived)
  const archived = categories.filter((category) => category.archived)

  const groups = CASHFLOW_TYPES.map((cashflow) => ({
    cashflow,
    rows: live.filter((category) => category.cashflow === cashflow),
  })).filter((group) => group.rows.length > 0)

  return (
    <section aria-labelledby="kategori" className="scroll-mt-8">
      <h2 id="kategori" className="text-base font-semibold tracking-tight text-ink">
        Kategori
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {live.length} kategori aktif di {groups.length} cashflow
        {archived.length > 0 ? `, ${archived.length} diarsipkan` : ''}.
      </p>

      <div className="mt-3 space-y-6">
        {groups.map((group) => (
          <div key={group.cashflow}>
            <h3 className="text-sm font-medium text-ink">{CASHFLOW_LABELS[group.cashflow]}</h3>
            <Table
              rows={group.rows}
              editing={editing}
              onToggle={(id) => setEditing(editing === id ? null : id)}
              caption={`Kategori bercashflow ${CASHFLOW_LABELS[group.cashflow]}`}
            />
          </div>
        ))}

        {archived.length > 0 ? (
          <div>
            <h3 className="text-sm font-medium text-ink">Diarsipkan</h3>
            <Table
              rows={archived}
              editing={editing}
              onToggle={(id) => setEditing(editing === id ? null : id)}
              caption="Kategori yang diarsipkan"
            />
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        Cashflow menentukan arah uang dan ikut tersimpan di setiap transaksi bersama sisi akunnya,
        jadi tidak bisa diubah setelah kategorinya dipakai. Warna dan ikon hanya penanda: yang
        tersimpan cuma derajat warnanya, terangnya mengikuti tema.
      </p>

      <details className="mt-3 border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm text-ink-muted">
          Nama yang dicari impor apa adanya
        </summary>
        <div className="border-t border-line p-4">
          <ul className="flex flex-wrap gap-1.5">
            {LOOKED_UP_NAMES.map((name) => (
              <li
                key={name}
                className="rounded-xs border border-line bg-sunken px-1.5 py-0.5 text-xs text-ink"
              >
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            Kalau salah satu diganti nama, baris impor yang biasanya ke sana menunggu di Tinjau
            tanpa kategori. Itu bukan kerusakan, hanya pekerjaan tambahan sekali.
          </p>
        </div>
      </details>

      <details className="mt-3 border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm text-accent">Tambah kategori</summary>
        <div className="border-t border-line p-4">
          <CategoryForm />
        </div>
      </details>
    </section>
  )
}

function Table({
  rows,
  editing,
  onToggle,
  caption,
}: {
  rows: CategoryView[]
  editing: string | null
  onToggle: (id: string) => void
  caption: string
}) {
  return (
    <div className="relative mt-2 overflow-x-auto border border-line bg-surface">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
            <th scope="col" className="px-4 py-2 font-medium">
              Kategori
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Transaksi
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Urutan
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Aksi
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((category, index) => (
            <Row
              key={category.id}
              category={category}
              first={index === 0}
              last={index === rows.length - 1}
              open={editing === category.id}
              onToggle={() => onToggle(category.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({
  category,
  first,
  last,
  open,
  onToggle,
}: {
  category: CategoryView
  first: boolean
  last: boolean
  open: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="border-b border-line last:border-0">
        <th scope="row" className="px-4 py-2.5 text-left font-normal text-ink">
          <CategoryMark
            name={category.name}
            cashflow={category.cashflow}
            icon={category.icon || null}
            hue={category.hue === '' ? null : Number(category.hue)}
          />
          {isLookedUpByName(category.name) ? (
            <span className="ml-2 text-xs text-ink-faint">dicari impor</span>
          ) : null}
        </th>
        <td className="tnum whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink-muted">
          {category.usage}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5">
          {category.archived ? (
            <span className="text-xs text-ink-faint">tidak diurutkan</span>
          ) : (
            <div className="flex gap-1">
              <MoveButton id={category.id} direction="up" name={category.name} disabled={first} />
              <MoveButton
                id={category.id}
                direction="down"
                name={category.name}
                disabled={last}
              />
            </div>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="h-9 rounded-sm border border-line px-2.5 text-xs text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
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
            <CategoryForm category={category} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

function MoveButton({
  id,
  direction,
  name,
  disabled,
}: {
  id: string
  direction: 'up' | 'down'
  name: string
  disabled: boolean
}) {
  const [, action] = useActionState<ActionResult | null, FormData>(moveCategory, null)

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={`${direction === 'up' ? 'Naikkan' : 'Turunkan'} ${name}`}
        className="h-9 w-9 rounded-sm border border-line text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken disabled:opacity-30"
      >
        <span aria-hidden="true">{direction === 'up' ? '↑' : '↓'}</span>
      </button>
    </form>
  )
}

function ArchiveButton({ category }: { category: CategoryView }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(setCategoryArchived, null)

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={category.id} />
      <input type="hidden" name="archived" value={category.archived ? '0' : '1'} />
      <button
        type="submit"
        className="h-9 rounded-sm border border-line px-2.5 text-xs text-ink-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
      >
        {category.archived ? 'Pakai lagi' : 'Arsipkan'}
      </button>
      {result ? (
        <span role="status" className={`text-xs ${result.ok ? 'text-under' : 'text-over'}`}>
          {result.message}
        </span>
      ) : null}
    </form>
  )
}
