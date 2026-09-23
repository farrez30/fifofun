import { ownWalletTopUp } from '@/lib/statement/classify'
import { WALLET_ACCOUNT_KEYS } from '@/lib/statement/to-ledger'
import { PARKING_CATEGORIES } from './tidy'

/**
 * Top-ups to the household's own wallets that were imported before the
 * wallet's number was known.
 *
 * Without the number, the import cannot tell topping up your own GoPay from
 * paying somebody else's, so it files the payment as spending. Once the
 * number is saved in settings, those rows can be read again from the
 * description they were imported with and turned into the transfer they
 * always were: money moved from the bank to the wallet, not money spent.
 *
 * The same caution as tidying (`tidy.ts`). Nothing is undone in bulk, so a
 * row a person has already decided about is left alone: one filed under a
 * category that is not an import default, one held back from tidying, or one
 * that was split. Those are counted rather than moved.
 */

export interface BackfillRow {
  id: string
  rawDescription: string | null
  /** Null when the row has no category. */
  categoryName: string | null
  categoryLockedAt: string | null
  splitOf: string | null
}

export interface BackfillMove {
  /** The wallet as the classifier names it, e.g. "GoPay". */
  wallet: string
  accountId: string
  ids: string[]
}

export interface BackfillPlan {
  moves: BackfillMove[]
  /** Rows moved in total. */
  count: number
  /** Own top-ups whose wallet has no account yet, by wallet label. */
  missing: { wallet: string; count: number }[]
  /** Own top-ups left alone because a person already decided about them. */
  protectedCount: number
}

const PARKING = new Set(PARKING_CATEGORIES)

/**
 * @param rows spending rows the bank account paid out to nobody in the ledger
 * @param walletAccounts account id by account key, for the household's live accounts
 */
export function planWalletBackfill(
  rows: BackfillRow[],
  own: string[],
  walletAccounts: Map<string, string>,
): BackfillPlan {
  const moves = new Map<string, BackfillMove>()
  const missing = new Map<string, number>()
  let protectedCount = 0

  for (const row of rows) {
    const wallet = row.rawDescription ? ownWalletTopUp(row.rawDescription, own) : null
    if (!wallet) continue

    const decided =
      row.categoryLockedAt !== null ||
      row.splitOf !== null ||
      (row.categoryName !== null && !PARKING.has(row.categoryName))
    if (decided) {
      protectedCount++
      continue
    }

    const accountId = walletAccounts.get(WALLET_ACCOUNT_KEYS[wallet])
    if (!accountId) {
      missing.set(wallet, (missing.get(wallet) ?? 0) + 1)
      continue
    }

    const move = moves.get(accountId) ?? { wallet, accountId, ids: [] }
    move.ids.push(row.id)
    moves.set(accountId, move)
  }

  const list = [...moves.values()]
  return {
    moves: list,
    count: list.reduce((sum, move) => sum + move.ids.length, 0),
    missing: [...missing].map(([wallet, count]) => ({ wallet, count })),
    protectedCount,
  }
}

/** The sentence settings shows under Simpan once a backfill ran. */
export function describeBackfill(plan: BackfillPlan): string | undefined {
  const parts: string[] = []
  if (plan.count > 0) {
    const wallets = plan.moves.map((move) => move.wallet).join(', ')
    parts.push(
      `${plan.count} transaksi lama ke ${wallets} ternyata top-up ke dompetmu sendiri, dan sekarang tercatat sebagai pindah dana, bukan pengeluaran.`,
    )
  }
  for (const { wallet, count } of plan.missing) {
    parts.push(
      `${count} top-up ke ${wallet} belum bisa dipindah karena belum ada akun ${wallet} dengan kunci impor ${WALLET_ACCOUNT_KEYS[wallet]}. Tambahkan akunnya, lalu simpan akun ini lagi.`,
    )
  }
  if (plan.protectedCount > 0) {
    parts.push(
      `${plan.protectedCount} top-up lain dibiarkan karena sudah kamu atur sendiri: kategorinya dipilih, ditahan saat merapikan, atau dipecah.`,
    )
  }
  return parts.length > 0 ? parts.join(' ') : undefined
}
