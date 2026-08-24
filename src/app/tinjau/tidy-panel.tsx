'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CategoryMark } from '@/components/marks'
import type { CashflowType } from '@/lib/ledger/types'
import { tidyLedger, type ActionResult } from './actions'

/**
 * Putting old rows where today's rules say they belong.
 *
 * The queue below settles rows nobody has looked at. This settles rows that
 * were looked at by an importer whose guesses were wrong: every QRIS payment
 * became a meal, so a year of petrol sat under Makan/minum with a confirmation
 * stamp on it, out of reach of every rule written since.
 *
 * The figures are computed on the server by the same function the button runs,
 * so what is listed is what happens. It is listed at all because there is no
 * undo: a person should be able to read every pot that moves before agreeing
 * to any of them.
 */

export interface TidyMoveView {
  from: string
  to: string
  cashflow: CashflowType
  icon: string | null
  hue: number | null
  count: number
  amount: string
}

export interface TidyView {
  moves: TidyMoveView[]
  count: number
  amount: string
  protectedCount: number
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="h-11 rounded-sm bg-accent px-4 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent-strong disabled:opacity-50"
    >
      {pending ? 'Merapikan' : 'Rapikan sekarang'}
    </button>
  )
}

export function TidyPanel({ view }: { view: TidyView }) {
  const [result, run] = useActionState<ActionResult | null, FormData>(tidyLedger, null)
  const [agreed, setAgreed] = useState(false)

  if (view.count === 0 && !result) return null

  return (
    <section
      id="rapikan"
      aria-labelledby="rapikan-judul"
      className="border border-line bg-sunken/40 p-4"
    >
      <h2 id="rapikan-judul" className="text-sm font-medium text-ink">
        {view.count} transaksi lama ada di pos yang bukan tempatnya
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Impor lama menebak kategori dari cara uangnya bergerak, bukan dari siapa yang dibayar,
        jadi setiap pembayaran QRIS jadi Makan/minum dan setiap tagihan jadi Belanja. Aturan yang
        sekarang tahu bedanya.
      </p>

      {view.moves.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <caption className="sr-only">
              Perpindahan yang akan dilakukan, diurutkan dari nominal terbesar
            </caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Dari
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Ke
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Transaksi
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Nilai
                </th>
              </tr>
            </thead>
            <tbody>
              {view.moves.map((move) => (
                <tr key={`${move.from} ${move.to}`} className="border-b border-line/60">
                  <td className="py-1.5 pr-3 text-ink-muted">{move.from}</td>
                  <td className="py-1.5 pr-3">
                    <CategoryMark
                      name={move.to}
                      cashflow={move.cashflow}
                      icon={move.icon}
                      hue={move.hue}
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-ink-muted">
                    {move.count}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-ink">{move.amount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-1.5 pr-3 font-medium text-ink" colSpan={2}>
                  Seluruhnya
                </td>
                <td className="py-1.5 pr-3 text-right font-medium tabular-nums text-ink">
                  {view.count}
                </td>
                <td className="py-1.5 text-right font-medium tabular-nums text-ink">
                  {view.amount}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      <p className="mt-3 text-sm text-ink-muted">
        Hanya transaksi yang masih duduk di pos bawaan impor yang dipindahkan.
        {view.protectedCount > 0
          ? ` ${view.protectedCount} transaksi yang kategorinya pernah kamu tetapkan sendiri tidak disentuh.`
          : ''}
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        Perpindahan ini tidak bisa dibatalkan sekaligus. Yang salah bisa kamu ubah satu per satu
        dari halaman transaksinya.
      </p>

      <form action={run} className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="confirm"
            value="ya"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            className="size-5 accent-[var(--accent)]"
          />
          Saya sudah membaca daftarnya
        </label>
        <Submit disabled={!agreed || view.count === 0} />
      </form>

      {result ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-2 border px-3 py-2 text-sm text-ink ${
            result.ok ? 'border-under/40 bg-under-wash' : 'border-over/40 bg-over-wash'
          }`}
        >
          {result.message}
          {result.detail ? (
            <span className="mt-0.5 block text-ink-muted">{result.detail}</span>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}
