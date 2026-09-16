'use client'

import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { BUTTON_PRIMARY, CONTROL, CONTROL_INLINE, FieldRow } from '@/components/field-base'
import { CategoryMark, ICONS, ICON_NAMES } from '@/components/marks'
import { PRESET_HUES, categoryHue } from '@/lib/ledger/palette'
import { isLookedUpByName, twinsOf } from '@/lib/ledger/settings'
import {
  CASHFLOW_HELP,
  CASHFLOW_LABELS,
  CASHFLOW_TYPES,
  type CashflowType,
} from '@/lib/ledger/types'
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
  /** Everything in the household, so the group choices can be worked out here. */
  siblings: CategoryView[]
}

export function CategoryForm({ category, cashflow, siblings }: Props) {
  const [result, action] = useActionState<ActionResult | null, FormData>(
    category ? updateCategory : createCategory,
    null,
  )

  const ids = { name: useId(), cashflow: useId(), hue: useId(), parent: useId(), description: useId() }
  const footerIds = {
    name: useId(),
    cashflow: useId(),
    description: useId(),
    parent: useId(),
  }

  const [name, setName] = useState(category?.name ?? '')
  const [flow, setFlow] = useState<CashflowType>(category?.cashflow ?? cashflow ?? 'spending')
  const [icon, setIcon] = useState(category?.icon ?? '')
  const [hue, setHue] = useState(category?.hue ?? '')
  const [parentId, setParentId] = useState(category?.parentId ?? '')

  /*
    A group can only be a category of the same cashflow that is not already
    inside one, and never this category itself. A category that already has
    things inside it cannot join a group either, because that would make its
    contents grandchildren and every report would need to know how deep to look.
  */
  const hasChildren = siblings.some((row) => row.parentId === category?.id)
  const parents = siblings.filter(
    (row) => row.cashflow === flow && row.parentId === '' && row.id !== category?.id,
  )

  const locked = category !== undefined && category.usage > 0
  const twins = twinsOf(flow)
  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {}

  return (
    <form action={action} className="space-y-4">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      {/*
        A grouped card of four rows rather than the two-column grid this
        used to be, for the reason `FieldRow` was written: name, cashflow,
        kamus and kelompok each want one line, not a label stacked above a
        control. The sentence explaining each one moves to a footer under
        the card (Apple's own section-footnote idiom) and is wired back to
        its field with `aria-describedby`, since the field itself no longer
        has room to carry it.
      */}
      <div className="rows-inset squircle rounded-md bg-surface shadow-xs">
        <FieldRow htmlFor={ids.name} label="Nama kategori" invalid={fieldErrors.name}>
          <input
            id={ids.name}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
            aria-describedby={isLookedUpByName(category?.name ?? '') ? footerIds.name : undefined}
            aria-invalid={fieldErrors.name ? true : undefined}
            className={CONTROL_INLINE}
          />
        </FieldRow>

        <FieldRow
          htmlFor={ids.cashflow}
          label="Cashflow"
          hint={locked ? `Terkunci, dipakai ${category?.usage} transaksi.` : undefined}
          invalid={fieldErrors.cashflow}
        >
          <select
            id={ids.cashflow}
            name={locked ? undefined : 'cashflow'}
            value={flow}
            disabled={locked}
            onChange={(event) => setFlow(event.target.value as CashflowType)}
            aria-describedby={footerIds.cashflow}
            aria-invalid={fieldErrors.cashflow ? true : undefined}
            className={`${CONTROL_INLINE} disabled:opacity-60`}
          >
            {CASHFLOW_TYPES.map((option) => (
              <option key={option} value={option}>
                {CASHFLOW_LABELS[option]}
              </option>
            ))}
          </select>
          {locked ? <input type="hidden" name="cashflow" value={flow} /> : null}
        </FieldRow>

        <FieldRow htmlFor={ids.description} label="Kamus" invalid={fieldErrors.description}>
          <input
            id={ids.description}
            name="description"
            defaultValue={category?.description ?? ''}
            maxLength={160}
            placeholder="Satu kalimat"
            aria-describedby={footerIds.description}
            aria-invalid={fieldErrors.description ? true : undefined}
            className={CONTROL_INLINE}
          />
        </FieldRow>

        <FieldRow htmlFor={ids.parent} label="Kelompok" invalid={fieldErrors.parentId}>
          <select
            id={ids.parent}
            name="parentId"
            value={hasChildren ? '' : parentId}
            disabled={hasChildren || parents.length === 0}
            onChange={(event) => setParentId(event.target.value)}
            aria-describedby={footerIds.parent}
            aria-invalid={fieldErrors.parentId ? true : undefined}
            className={`${CONTROL_INLINE} disabled:opacity-60`}
          >
            <option value="">Berdiri sendiri</option>
            {parents.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </FieldRow>
      </div>

      {/*
        One block per field, in row order, so a paragraph reads as the row
        above it explained rather than as one undifferentiated wall of text.
        The one constraint urgent enough to need answering before anyone
        scrolls this far — a locked cashflow — moved into the row's own
        hint above; what stays here is context worth reading, not context
        worth blocking on.
      */}
      <div className="space-y-3 px-4">
        {isLookedUpByName(category?.name ?? '') || twins.length > 0 ? (
          <div className="space-y-1">
            {isLookedUpByName(category?.name ?? '') ? (
              <p id={footerIds.name} className="text-footnote text-ink-muted">
                Nama ini dicari impor apa adanya. Kalau diganti, baris yang biasanya masuk ke sini
                akan menunggu di Tinjau tanpa kategori sampai kamu memberinya kategori atau aturan.
              </p>
            ) : null}
            {twins.length > 0 ? (
              <p className="text-footnote text-ink-muted">
                Pos seperti ini berpasangan dengan{' '}
                {twins.map((twin) => CASHFLOW_LABELS[twin]).join(' atau ')}, dan keduanya diganti
                nama bersama-sama.
              </p>
            ) : null}
          </div>
        ) : null}
        <p id={footerIds.cashflow} className="text-footnote text-ink-muted">
          {CASHFLOW_HELP[flow]}
        </p>
        <p id={footerIds.description} className="text-footnote text-ink-muted">
          Kalimat ini muncul di bawah pilihan kategori saat mencatat dan meninjau. Tulis aturan
          batasnya, bukan mengulang namanya: kapan sesuatu masuk ke sini, bukan ke pos sebelah.
        </p>
        <p id={footerIds.parent} className="text-footnote text-ink-muted">
          {hasChildren
            ? 'Kategori ini sendiri sebuah kelompok, jadi tidak bisa dimasukkan ke kelompok lain. Kelompok tidak menampung transaksi; yang dijumlahkan adalah isinya.'
            : parents.length === 0
              ? 'Belum ada kategori lain di cashflow ini yang bisa jadi kelompoknya.'
              : 'Kalau dimasukkan ke sebuah kelompok, angkanya ikut dijumlahkan di baris kelompok itu pada Laporan, dan bisa dibuka satu per satu di sana.'}
        </p>
      </div>

      <fieldset>
        <legend className="text-subhead font-medium text-ink">Ikon</legend>
        <div className="mt-2 flex flex-wrap gap-1">
          {/* An icon chosen by accident has to be removable, the same way the
              hue below has "Ikuti warna bawaan". */}
          <label
            className={`inline-flex size-11 cursor-pointer items-center justify-center rounded-sm border text-footnote transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
              icon === ''
                ? 'border-accent bg-accent-wash text-ink'
                : 'border-line text-ink-muted hover:border-line-strong hover:bg-sunken'
            }`}
          >
            <input
              type="radio"
              name="icon"
              value=""
              checked={icon === ''}
              onChange={() => setIcon('')}
              className="sr-only"
            />
            bawaan
          </label>
          {ICON_NAMES.map((option) => {
            const Glyph = ICONS[option]
            return (
              <label
                key={option}
                /*
                  The radio itself is one pixel and invisible, so the focus ring
                  has to be drawn on the box a person can actually see. Without
                  this, tabbing through forty-six icons moves a ring nobody can
                  find.
                */
                className={`inline-flex size-11 cursor-pointer items-center justify-center rounded-sm border transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
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
        <legend className="text-subhead font-medium text-ink">Warna</legend>
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
            className="h-9 rounded-sm border border-line px-2.5 text-footnote text-ink-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            Ikuti warna bawaan
          </button>
        </div>

        <p className="mt-2 flex items-center gap-2 text-subhead text-ink">
          <span className="text-footnote text-ink-muted">Tampilnya:</span>
          <CategoryMark
            name={name || 'Kategori baru'}
            cashflow={flow}
            icon={icon || null}
            hue={hue === '' ? null : Number(hue)}
          />
          <span className="text-footnote text-ink-faint">
            {hue === ''
              ? `bawaan ${categoryHue({ name: name || 'Kategori baru', hue: null })} derajat`
              : `${hue} derajat`}
          </span>
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Submit label={category ? 'Simpan kategori' : 'Tambah kategori'} />
        {result ? (
          <p role="status" className={`text-subhead ${result.ok ? 'text-under' : 'text-over'}`}>
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
      className={BUTTON_PRIMARY}
    >
      {pending ? 'Menyimpan' : label}
    </button>
  )
}
