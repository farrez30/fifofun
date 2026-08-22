'use client'

import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CONTROL, FieldLabel } from '@/components/field-base'
import { CategoryMark, ICONS, ICON_NAMES } from '@/components/marks'
import { PRESET_HUES, categoryHue } from '@/lib/ledger/palette'
import { isLookedUpByName, twinsOf } from '@/lib/ledger/settings'
import { CASHFLOW_LABELS, CASHFLOW_TYPES, type CashflowType } from '@/lib/ledger/types'
import type { ActionResult } from '@/lib/actions'
import { createCategory, updateCategory } from './actions'
import type { CategoryView } from './categories-panel'

/**
 * One category, and the two things that make it recognisable.
 *
 * The icon and the hue are identity rather than meaning: they are what makes
 * the same category findable in the flow diagram, the review queue and the
 * month detail without reading. So the preview is the real mark, drawn from
 * the same component the rest of the app draws, rather than a swatch that
 * approximates it.
 *
 * The cashflow is the one field that can be locked. It is copied onto every
 * transaction filed under the category, together with the account sides it
 * decided, so changing it after the fact would leave rows the balance check
 * refuses. Locked, it is still submitted, because a disabled select posts
 * nothing and the row has to keep the value it already had.
 */

interface Props {
  category?: CategoryView
  /** Fixes the cashflow of a new category, when one section asks for it. */
  cashflow?: CashflowType
}

export function CategoryForm({ category, cashflow }: Props) {
  const [result, action] = useActionState<ActionResult | null, FormData>(
    category ? updateCategory : createCategory,
    null,
  )

  const ids = { name: useId(), cashflow: useId(), hue: useId() }

  const [name, setName] = useState(category?.name ?? '')
  const [flow, setFlow] = useState<CashflowType>(category?.cashflow ?? cashflow ?? 'spending')
  const [icon, setIcon] = useState(category?.icon ?? '')
  const [hue, setHue] = useState(category?.hue ?? '')

  const locked = category !== undefined && category.usage > 0
  const twins = twinsOf(flow)

  return (
    <form action={action} className="space-y-4">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel htmlFor={ids.name}>Nama kategori</FieldLabel>
          <input
            id={ids.name}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
            className={CONTROL}
          />
          {isLookedUpByName(category?.name ?? '') ? (
            <p className="text-xs text-ink-muted">
              Nama ini dicari impor apa adanya. Kalau diganti, baris yang biasanya masuk ke sini
              akan menunggu di Tinjau tanpa kategori sampai kamu memberinya kategori atau aturan.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor={ids.cashflow}>Cashflow</FieldLabel>
          <select
            id={ids.cashflow}
            name={locked ? undefined : 'cashflow'}
            value={flow}
            disabled={locked}
            onChange={(event) => setFlow(event.target.value as CashflowType)}
            className={`${CONTROL} disabled:opacity-60`}
          >
            {CASHFLOW_TYPES.map((option) => (
              <option key={option} value={option}>
                {CASHFLOW_LABELS[option]}
              </option>
            ))}
          </select>
          {locked ? (
            <>
              <input type="hidden" name="cashflow" value={flow} />
              <p className="text-xs text-ink-muted">
                Dipakai {category?.usage} transaksi, jadi arahnya terkunci. Buat kategori baru
                kalau memang butuh arah yang berbeda.
              </p>
            </>
          ) : null}
          {twins.length > 0 ? (
            <p className="text-xs text-ink-muted">
              Pos seperti ini berpasangan dengan {twins.map((twin) => CASHFLOW_LABELS[twin]).join(' atau ')}
              , dan keduanya diganti nama bersama-sama.
            </p>
          ) : null}
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink">Ikon</legend>
        <div className="mt-2 flex flex-wrap gap-1">
          {ICON_NAMES.map((option) => {
            const Glyph = ICONS[option]
            return (
              <label
                key={option}
                className={`inline-flex size-11 cursor-pointer items-center justify-center rounded-sm border transition-colors duration-150 ${
                  icon === option
                    ? 'border-accent bg-accent-wash'
                    : 'border-line hover:border-line-strong hover:bg-sunken'
                }`}
              >
                <input
                  type="radio"
                  name="icon"
                  value={option}
                  checked={icon === option}
                  onChange={() => setIcon(option)}
                  className="sr-only"
                />
                <Glyph aria-hidden="true" weight="regular" className="size-5 text-ink" />
                <span className="sr-only">{option}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-ink">Warna</legend>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {PRESET_HUES.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`Warna ${preset} derajat`}
              aria-pressed={hue === String(preset)}
              onClick={() => setHue(String(preset))}
              className={`size-9 rounded-sm border transition-colors duration-150 ${
                hue === String(preset) ? 'border-ink' : 'border-line hover:border-line-strong'
              }`}
              style={{
                backgroundColor: `oklch(var(--category-l) var(--category-c) ${preset})`,
              }}
            />
          ))}
          <input
            id={ids.hue}
            type="number"
            name="hue"
            min={0}
            max={359}
            value={hue}
            onChange={(event) => setHue(event.target.value)}
            aria-label="Warna dalam derajat"
            className={`${CONTROL} tnum h-9 w-24 font-mono`}
          />
          <button
            type="button"
            onClick={() => setHue('')}
            className="h-9 rounded-sm border border-line px-2.5 text-xs text-ink-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            Ikuti warna bawaan
          </button>
        </div>

        <p className="mt-2 flex items-center gap-2 text-sm text-ink">
          <span className="text-xs text-ink-muted">Tampilnya:</span>
          <CategoryMark
            name={name || 'Kategori baru'}
            cashflow={flow}
            icon={icon || null}
            hue={hue === '' ? null : Number(hue)}
          />
          <span className="text-xs text-ink-faint">
            {hue === ''
              ? `bawaan ${categoryHue({ name: name || 'Kategori baru', hue: null })} derajat`
              : `${hue} derajat`}
          </span>
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Submit label={category ? 'Simpan kategori' : 'Tambah kategori'} />
        {result ? (
          <p role="status" className={`text-sm ${result.ok ? 'text-under' : 'text-over'}`}>
            {result.message}
            {result.detail ? <span className="text-ink-muted"> {result.detail}</span> : null}
          </p>
        ) : null}
      </div>
    </form>
  )
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-sm border border-line-strong px-3 text-sm text-ink transition-colors duration-150 hover:bg-sunken disabled:opacity-40"
    >
      {pending ? 'Menyimpan' : label}
    </button>
  )
}
