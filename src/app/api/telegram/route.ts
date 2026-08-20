import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { formatIdr } from '@/lib/money'
import { isFailure, parseQuickEntry } from '@/lib/telegram/parse'
import { CASHFLOW_TYPES } from '@/lib/ledger/types'

/**
 * Telegram webhook.
 *
 * This is the only endpoint in the app that writes to the ledger without a
 * signed-in user, so every gate has to be here rather than assumed elsewhere.
 * Three of them, in order:
 *
 *   1. The secret token Telegram echoes back on every delivery. Compared in
 *      constant time, because a byte-by-byte comparison leaks the prefix.
 *   2. An explicit allowlist of chat ids. Knowing the bot's username is enough
 *      to message it, so authentication of the *sender* cannot come from
 *      Telegram alone.
 *   3. A rate limit, so a leaked token cannot be used to fill the ledger.
 *
 * Writes here use the service key and therefore bypass row level security,
 * which is exactly why the chat-to-household binding is configuration rather
 * than anything derived from the request.
 */

export const runtime = 'nodejs'

interface TelegramUpdate {
  message?: {
    message_id: number
    date: number
    chat: { id: number }
    text?: string
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so the lengths are compared first and the result folded in.
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function allowedChats(): Set<string> {
  return new Set(
    (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  )
}

/*
  A sliding window held in memory.

  It resets whenever the serverless instance is recycled, so it is a brake
  rather than a guarantee. That is the right trade here: the real gate is the
  allowlist, and this exists so a mistake behind it cannot run away.
*/
const RATE_LIMIT = { messages: 20, windowMs: 60_000 }
const seen = new Map<string, number[]>()

function withinRateLimit(chatId: string): boolean {
  const now = Date.now()
  const recent = (seen.get(chatId) ?? []).filter((at) => now - at < RATE_LIMIT.windowMs)
  if (recent.length >= RATE_LIMIT.messages) return false

  recent.push(now)
  seen.set(chatId, recent)
  return true
}

async function reply(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => {
    // A failed reply must not fail the webhook: Telegram would redeliver the
    // update and the entry would be recorded twice.
  })
}

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) {
    // Refuse to run unconfigured rather than accepting anything that arrives.
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  const presented = request.headers.get('x-telegram-bot-api-secret-token') ?? ''
  if (!constantTimeEquals(presented, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let update: TelegramUpdate
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  const message = update.message
  if (!message?.text) return NextResponse.json({ ok: true })

  const chatId = String(message.chat.id)

  /*
    An unknown chat gets silence, not an error.

    Telegram redelivers on any non-2xx, so replying with a failure would turn a
    stranger's message into a retry loop. Saying nothing also avoids confirming
    that the bot is live and connected to anything.
  */
  if (!allowedChats().has(chatId)) return NextResponse.json({ ok: true })

  if (!withinRateLimit(chatId)) {
    await reply(message.chat.id, 'Terlalu banyak pesan dalam semenit. Coba lagi sebentar lagi.')
    return NextResponse.json({ ok: true })
  }

  const text = message.text.trim()

  if (text === '/start' || text === '/help') {
    await reply(
      message.chat.id,
      [
        '<b>Catat transaksi tunai</b>',
        '',
        'Tulis nominal lalu keterangannya:',
        '<code>50rb makan siang</code>',
        '<code>12.500 parkir</code>',
        '<code>+9jt gaji</code>',
        '<code>nabung 1jt</code>',
        '',
        'Awalan <code>+</code> berarti pemasukan. Pengali yang dikenali: rb, k, jt, juta, m, miliar.',
        '',
        'Kanal ini untuk uang tunai, yang tidak pernah terlihat oleh mutasi bank.',
      ].join('\n'),
    )
    return NextResponse.json({ ok: true })
  }

  const parsed = parseQuickEntry(text)
  if (isFailure(parsed)) {
    await reply(message.chat.id, parsed.help)
    return NextResponse.json({ ok: true })
  }

  const householdId = process.env.TELEGRAM_HOUSEHOLD_ID
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY

  if (!householdId || !url || !secret) {
    await reply(message.chat.id, 'Bot belum terhubung ke rumah tangga mana pun.')
    return NextResponse.json({ ok: true })
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const cashflow = CASHFLOW_TYPES.includes(parsed.cashflow) ? parsed.cashflow : 'spending'

  // The Telegram message id is unique per chat and never reused, so replaying
  // an update, which Telegram does whenever a delivery is not acknowledged,
  // cannot create a second row.
  const dedupeKey = `telegram:${chatId}:${message.message_id}`

  const { data: cashAccount } = await supabase
    .from('accounts')
    .select('id')
    .eq('household_id', householdId)
    .eq('name', 'Cash')
    .maybeSingle()

  const isIncoming = cashflow === 'income' || cashflow === 'from_asset'

  const { error } = await supabase.from('transactions').upsert(
    {
      household_id: householdId,
      occurred_at: new Date(message.date * 1000).toISOString(),
      description: parsed.note || 'Catatan dari Telegram',
      amount: parsed.amount.toString(),
      cashflow,
      from_account_id: isIncoming ? null : (cashAccount?.id ?? null),
      to_account_id: isIncoming ? (cashAccount?.id ?? null) : null,
      source: 'telegram',
      dedupe_key: dedupeKey,
      note: parsed.note || null,
      // A chat message is one person's shorthand, so the category is a guess
      // until somebody confirms it in the app.
      needs_review: true,
      raw_description: text,
    },
    { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true },
  )

  if (error) {
    await reply(message.chat.id, 'Gagal menyimpan. Coba lagi.')
    return NextResponse.json({ ok: true })
  }

  const direction = isIncoming ? 'Masuk' : 'Keluar'
  await reply(
    message.chat.id,
    `${direction} <b>${formatIdr(parsed.amount)}</b>${parsed.note ? ` · ${parsed.note}` : ''}\nTercatat, menunggu kategori dipastikan di aplikasi.`,
  )

  return NextResponse.json({ ok: true })
}
