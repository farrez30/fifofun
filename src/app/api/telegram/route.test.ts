import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseStub } from '@/test/supabase-stub'
import { POST } from './route'

/**
 * These tests are about the gates, not the bookkeeping.
 *
 * This is the one endpoint that writes to the ledger with no signed-in user and
 * a key that bypasses row level security, so every test here asks the same
 * question: can something that is not the owner get a row written?
 */

const SECRET = 'a-long-webhook-secret-value'
const CHAT = 987654321

/*
  The shared recorder rather than a bespoke mock. The bot looks the cash
  account up by its import key now, which is one `.is` more than the old stub
  could chain, and every other action test already answers through this one.
*/
const stub = createSupabaseStub()

vi.mock('@supabase/supabase-js', () => ({ createClient: () => stub.client }))

const CASH = { id: 'cash-account' }

/** Rows the client was asked to write. */
const written = () => stub.callsOn('transactions').map((call) => call.payload)

function request(body: unknown, secret: string | null = SECRET): Request {
  return new Request('https://example.test/api/telegram', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret === null ? {} : { 'x-telegram-bot-api-secret-token': secret }),
    },
    body: JSON.stringify(body),
  })
}

function message(text: string, chatId = CHAT, messageId = 1) {
  return {
    message: {
      message_id: messageId,
      date: Math.floor(Date.parse('2026-08-19T10:00:00Z') / 1000),
      chat: { id: chatId },
      text,
    },
  }
}

beforeEach(() => {
  stub.reset()
  // Every message reads the cash account first, so every test has one.
  for (let i = 0; i < 25; i++) stub.queue('accounts', { data: CASH })
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('TELEGRAM_ALLOWED_CHAT_IDS', String(CHAT))
  vi.stubEnv('TELEGRAM_HOUSEHOLD_ID', 'household-1')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test')
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the secret token gate', () => {
  it('refuses to run at all when no secret is configured', async () => {
    // Unconfigured must mean closed, never open.
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', '')
    const response = await POST(request(message('50rb kopi')))
    expect(response.status).toBe(503)
    expect(written()).toEqual([])
  })

  it('rejects a missing token', async () => {
    const response = await POST(request(message('50rb kopi'), null))
    expect(response.status).toBe(401)
    expect(written()).toEqual([])
  })

  it('rejects a wrong token', async () => {
    const response = await POST(request(message('50rb kopi'), 'wrong-secret-value-here'))
    expect(response.status).toBe(401)
    expect(written()).toEqual([])
  })

  it('rejects a token that is merely a prefix of the real one', async () => {
    const response = await POST(request(message('50rb kopi'), SECRET.slice(0, 10)))
    expect(response.status).toBe(401)
    expect(written()).toEqual([])
  })

  it('accepts the right token', async () => {
    const response = await POST(request(message('50rb kopi')))
    expect(response.status).toBe(200)
    expect(written()).toHaveLength(1)
  })
})

describe('the chat allowlist', () => {
  it('writes nothing for a chat that is not on the list', async () => {
    const response = await POST(request(message('50rb kopi', 111222333)))
    expect(response.status).toBe(200)
    expect(written()).toEqual([])
  })

  it('answers an unknown chat with silence rather than an error', async () => {
    // A non-2xx would make Telegram redeliver, turning one stranger's message
    // into a retry loop, and a reply would confirm the bot is connected.
    await POST(request(message('halo', 111222333)))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('writes nothing when the allowlist is empty', async () => {
    vi.stubEnv('TELEGRAM_ALLOWED_CHAT_IDS', '')
    await POST(request(message('50rb kopi')))
    expect(written()).toEqual([])
  })
})

describe('the account the bot writes against', () => {
  it('finds it by import key, not by being called Cash', async () => {
    await POST(request(message('50rb makan siang')))

    const lookup = stub.callsOn('accounts')[0]
    expect(lookup.args[lookup.chain.indexOf('eq') + 1]).toEqual(['key', 'cash'])
    expect(written()).toHaveLength(1)
  })

  it('writes nothing when no account holds that key', async () => {
    stub.reset()
    stub.queue('accounts', { data: null })

    const response = await POST(request(message('50rb makan siang')))

    // A row with neither side filled in would save happily and move no
    // balance at all, which is worse than not saving it.
    expect(response.status).toBe(200)
    expect(written()).toEqual([])
    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(String(options.body)).toContain('kunci impor cash')
  })
})

describe('recording an entry', () => {
  it('records the amount, direction and note', async () => {
    await POST(request(message('50rb makan siang')))
    expect(written()[0]).toMatchObject({
      household_id: 'household-1',
      amount: '5000000',
      cashflow: 'spending',
      note: 'makan siang',
      source: 'telegram',
      needs_review: true,
    })
  })

  it('marks every entry for review, because a chat message is shorthand', async () => {
    await POST(request(message('+9jt gaji')))
    expect(written()[0]).toMatchObject({ cashflow: 'income', needs_review: true })
  })

  it('keys on the Telegram message id so a redelivery cannot duplicate it', async () => {
    await POST(request(message('50rb kopi', CHAT, 42)))
    expect(written()[0]).toMatchObject({ dedupe_key: `telegram:${CHAT}:42` })
  })

  it('keeps the original text, since the parser will change', async () => {
    await POST(request(message('50rb makan siang')))
    expect(written()[0]).toMatchObject({ raw_description: '50rb makan siang' })
  })

  it('puts income on the receiving side of the cash account', async () => {
    await POST(request(message('masuk 500rb refund')))
    expect(written()[0]).toMatchObject({ to_account_id: 'cash-account', from_account_id: null })
  })

  it('answers a message it cannot read with the grammar instead of recording it', async () => {
    const response = await POST(request(message('makan siang enak')))
    expect(response.status).toBe(200)
    expect(written()).toEqual([])
    expect(fetch).toHaveBeenCalled()
  })

  it('answers /start with help and writes nothing', async () => {
    await POST(request(message('/start')))
    expect(written()).toEqual([])
    expect(fetch).toHaveBeenCalled()
  })

  it('refuses to write when no household is configured', async () => {
    vi.stubEnv('TELEGRAM_HOUSEHOLD_ID', '')
    await POST(request(message('50rb kopi')))
    expect(written()).toEqual([])
  })
})

describe('the reply Telegram has to be able to render', () => {
  /** The body of the last sendMessage call. */
  const sent = () => {
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const last = calls.at(-1)?.[1] as { body: string } | undefined
    return last ? (JSON.parse(last.body) as { text: string; parse_mode: string }) : null
  }

  it('escapes a note that would otherwise be read as markup', async () => {
    /*
      Telegram rejects the whole message with a 400 when < > or & appear outside
      a tag. The reply is sent after the row is written and its failure is
      silent, so the person sees nothing come back, sends the same thing again,
      and the resend carries a new message id: a new dedupe key, a second row.
    */
    await POST(request(message('25rb baju <ukuran M> & topi')))

    expect(sent()?.parse_mode).toBe('HTML')
    expect(sent()?.text).toContain('baju &lt;ukuran M&gt; &amp; topi')
    expect(sent()?.text).not.toContain('<ukuran')
  })

  it('leaves the note it stores alone', async () => {
    // The escaping is for the wire, not for the ledger. A note kept as entities
    // would show up escaped everywhere the app prints it.
    await POST(request(message('25rb baju <ukuran M>')))
    expect(written()[0]).toMatchObject({ note: 'baju <ukuran M>' })
  })

  it('still marks up the parts it wrote itself', async () => {
    await POST(request(message('25rb kopi')))
    expect(sent()?.text).toContain('<b>')
  })
})

describe('the rate limit', () => {
  it('stops accepting past the ceiling within one window', async () => {
    // A distinct chat id so this test does not inherit another test's window.
    const chat = 555000111
    vi.stubEnv('TELEGRAM_ALLOWED_CHAT_IDS', String(chat))

    for (let i = 0; i < 20; i += 1) {
      await POST(request(message('10rb kopi', chat, 1000 + i)))
    }
    expect(written()).toHaveLength(20)

    await POST(request(message('10rb kopi', chat, 9999)))
    expect(written()).toHaveLength(20)
  })
})

describe('malformed input', () => {
  it('acknowledges a body that is not JSON rather than erroring', async () => {
    const bad = new Request('https://example.test/api/telegram', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': SECRET,
      },
      body: 'not json at all',
    })
    const response = await POST(bad)
    expect(response.status).toBe(200)
    expect(written()).toEqual([])
  })

  it('ignores an update with no message', async () => {
    const response = await POST(request({ edited_message: { text: 'hi' } }))
    expect(response.status).toBe(200)
    expect(written()).toEqual([])
  })
})
