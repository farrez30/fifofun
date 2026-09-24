import { ownAccountTransfer, ownWalletTopUp } from '@/lib/statement/classify'
import { WALLET_ACCOUNT_KEYS } from '@/lib/statement/to-ledger'
import { PARKING_CATEGORIES } from './tidy'

/**
 * Money the household moved between its own accounts, imported before the
 * app knew those accounts were its own.
 *
 * Two kinds of row. A top-up to the household's own e-wallet, which the
 * import cannot tell from paying somebody else's until the wallet's phone
 * number is saved; and a transfer to or from another account the household
 * holds (a second bank, the old Mandiri account, an e-wallet paying out over
 * BI Fast), which it cannot tell from a stranger's until that account's
 * number is saved. Both went in as spending or income. Once the numbers are
 * known, the description each row was imported with is read again, and the
 * row becomes the transfer it always was.
 *
 * The same caution as tidying (`tidy.ts`). Nothing is undone in bulk, so a
 * row a person has already decided about is left alone: one filed under a
 * category that is not an import default, one held back from tidying, or one
 * that was split. Those are counted rather than moved.
 */

export interface BackfillRow {
  id: string
  /** Which way the money went from the imported bank account's side. */
  direction: 'in' | 'out'
  rawDescription: string | null
  /** Null when the row has no category. */
  categoryName: string | null
  categoryLockedAt: string | null
  splitOf: string | null
}

export interface BackfillMove {
  /** What the reader calls the other account: "GoPay", "Bank Jago". */
  label: string
  accountId: string
  /**
   * The side the other account goes on. Money out gains a destination, money
   * in gains a source; the bank side is already on the row.
   */
  side: 'to' | 'from'
  ids: string[]
}

export interface BackfillPlan {
  moves: BackfillMove[]
  /** Rows moved in total. */
  count: number
  /** Own wallet top-ups whose wallet has no account yet, by wallet label. */
  missing: { wallet: string; count: number }[]
  /** Own-money rows left alone because a person already decided about them. */
  protectedCount: number
}

export interface OwnMoney {
  /** Phone numbers of the household's e-wallets, from the bank account. */
  walletNumbers: string[]
  /** Account id by account key, for the household's live accounts. */
  walletAccounts: Map<string, string>
  /** The household's own accounts by account number, digits only. */
  accountsByNumber: Map<string, { id: string; name: string }>
}

const PARKING = new Set(PARKING_CATEGORIES)

type Target = { label: string; accountId: string } | { missingWallet: string } | null

function targetOf(row: BackfillRow, own: OwnMoney): Target {
  if (!row.rawDescription) return null

  if (row.direction === 'out') {
    const wallet = ownWalletTopUp(row.rawDescription, own.walletNumbers)
    if (wallet) {
      const accountId = own.walletAccounts.get(WALLET_ACCOUNT_KEYS[wallet])
      return accountId ? { label: wallet, accountId } : { missingWallet: wallet }
    }
  }

  const number = ownAccountTransfer(row.rawDescription, row.direction, [...own.accountsByNumber.keys()])
  const account = number ? own.accountsByNumber.get(number) : undefined
  return account ? { label: account.name, accountId: account.id } : null
}

export function planOwnMoneyBackfill(rows: BackfillRow[], own: OwnMoney): BackfillPlan {
  const moves = new Map<string, BackfillMove>()
  const missing = new Map<string, number>()
  let protectedCount = 0

  for (const row of rows) {
    const target = targetOf(row, own)
    if (!target) continue

    const decided =
      row.categoryLockedAt !== null ||
      row.splitOf !== null ||
      (row.categoryName !== null && !PARKING.has(row.categoryName))
    if (decided) {
      protectedCount++
      continue
    }

    if ('missingWallet' in target) {
      missing.set(target.missingWallet, (missing.get(target.missingWallet) ?? 0) + 1)
      continue
    }

    const side = row.direction === 'out' ? 'to' : 'from'
    const key = `${side}:${target.accountId}`
    const move = moves.get(key) ?? { label: target.label, accountId: target.accountId, side, ids: [] }
    move.ids.push(row.id)
    moves.set(key, move)
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
    const labels = [...new Set(plan.moves.map((move) => move.label))].join(', ')
    parts.push(
      `${plan.count} transaksi lama dengan ${labels} ternyata pindah dana antar akunmu sendiri, dan sekarang tercatat begitu, bukan sebagai pemasukan atau pengeluaran.`,
    )
  }
  for (const { wallet, count } of plan.missing) {
    parts.push(
      `${count} top-up ke ${wallet} belum bisa dipindah karena belum ada akun ${wallet} dengan kunci impor ${WALLET_ACCOUNT_KEYS[wallet]}. Tambahkan akunnya, lalu simpan akun ini lagi.`,
    )
  }
  if (plan.protectedCount > 0) {
    parts.push(
      `${plan.protectedCount} lainnya dibiarkan karena sudah kamu atur sendiri: kategorinya dipilih, ditahan saat merapikan, atau dipecah.`,
    )
  }
  return parts.length > 0 ? parts.join(' ') : undefined
}
