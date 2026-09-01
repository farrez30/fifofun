'use client'

import { useState } from 'react'

/**
 * Two readings of the same balance line, with the reader choosing.
 *
 * A balance adjustment lands as a cliff: months of e-wallet spending that
 * nobody recorded, booked on the single day the wallet was finally checked.
 * The line before it is too high and the drop is not a month of overspending,
 * which is exactly the wrong story for the one chart meant to answer whether
 * the pile is growing.
 *
 * Restating it is not a fix to the ledger and is not offered as one. The
 * recorded line stays, it stays the default, and the switch says in words
 * which of the two is on screen — the same bargain a published restatement
 * makes: the journal is untouched, the presentation is relabelled.
 *
 * Both charts arrive rendered from the server, so the money stays there: this
 * component chooses between two subtrees and knows nothing about rupiah.
 */

const VIEWS = [
  {
    id: 'recorded',
    label: 'Seperti tercatat',
    hint: 'Garis apa adanya: penyesuaian tetap jatuh di bulan ia dicatat.',
  },
  {
    id: 'restated',
    label: 'Disebar mundur',
    hint: 'Penyesuaian dibagi ke bulan-bulan sebelumnya, mengikuti isi ulang tiap dompet.',
  },
] as const

type View = (typeof VIEWS)[number]['id']

interface Props {
  recorded: React.ReactNode
  restated: React.ReactNode
  /** How much was moved and when it was booked, already in words. */
  note: string
  /**
   * Whether the restated line dips below zero somewhere.
   *
   * It can, and the number is left standing rather than clamped: a month goes
   * negative exactly when the float spread into it was larger than the surplus
   * that month recorded, which is the truest thing this view has to say. Left
   * unexplained it reads as an overdraft that never happened, so it is said in
   * words instead of being tidied away.
   */
  dipped?: boolean
}

export function BalanceSwitch({ recorded, restated, note, dipped = false }: Props) {
  const [view, setView] = useState<View>('recorded')

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">{note}</p>

        <div
          role="radiogroup"
          aria-label="Cara membaca saldo"
          className="flex border border-line"
          data-balance-switch
        >
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={view === option.id}
              title={option.hint}
              onClick={() => setView(option.id)}
              className={`px-2.5 py-1 text-xs transition-colors duration-150 ${
                view === option.id
                  ? 'bg-accent text-paper'
                  : 'bg-surface text-ink-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Keyed so the swap fades rather than snapping to a different line. */}
      <div key={view} className="reveal">
        {view === 'recorded' ? recorded : restated}
      </div>

      {view === 'restated' ? (
        <p className="mt-2 text-xs text-ink-muted">
          Ini penyajian ulang, bukan catatan baru: tidak ada transaksi yang dipindah atau diubah.
          Tanggal aslinya memang tidak ada, tak satu pun rekening pernah melihatnya, jadi
          sebarannya mengikuti isi ulang tiap dompet per bulan. Bentuk garisnya jadi lebih jujur,
          tapi angkanya tetap perkiraan, dan saldo bulan terakhir sama persis di kedua tampilan.
          {dipped
            ? ' Ada bulan yang jadi minus di tampilan ini. Itu bukan rekening jebol: artinya uang yang waktu itu terasa masih ada sebetulnya sudah keburu terpakai.'
            : null}
        </p>
      ) : null}
    </div>
  )
}
