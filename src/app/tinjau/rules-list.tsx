'use client'

import { useActionState } from 'react'
import { MATCH_LABELS, type MatchType } from '@/lib/ledger/rules'
import type { RuleRow } from '@/lib/queries/household'
import { deleteRule, type ActionResult } from './actions'

/**
 * The rules the household has taught the app.
 *
 * Shown in the order they run, with the number of rows each has settled. A rule
 * with a hit count of zero has never fired, and seeing that is the only way to
 * discover a rule whose pattern was wrong all along.
 */

export function RulesList({ rules }: { rules: RuleRow[] }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(deleteRule, null)

  if (rules.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Belum ada aturan. Aturan pertama dibuat saat kamu menyetujui satu kelompok di sebelah.
      </p>
    )
  }

  return (
    <div>
      {result ? (
        <p className={`mb-2 text-sm ${result.ok ? 'text-under' : 'text-over'}`}>{result.message}</p>
      ) : null}

      <ul className="space-y-2">
        {rules.map((rule) => (
          <li key={rule.id} className="border border-line bg-surface p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-sm text-ink">
                <span className="truncate">{rule.pattern}</span>
              </p>
              <form action={action}>
                <input type="hidden" name="ruleId" value={rule.id} />
                <button
                  type="submit"
                  className="shrink-0 text-xs text-ink-faint underline underline-offset-2 hover:text-over"
                >
                  Hapus
                </button>
              </form>
            </div>

            <p className="mt-0.5 text-xs text-ink-muted">
              {MATCH_LABELS[rule.matchType as MatchType]} · {rule.categoryName ?? 'tanpa kategori'}
            </p>

            <p className="mt-0.5 text-xs text-ink-faint">
              {rule.hitCount === 0
                ? 'Belum pernah cocok dengan satu transaksi pun.'
                : `Sudah menyelesaikan ${rule.hitCount} transaksi.`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
