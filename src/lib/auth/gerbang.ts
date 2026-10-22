import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies'
import { cookies, headers } from 'next/headers'
import { auth } from './server'

/**
 * The three things the login page does, in one place the tests can mock.
 *
 * Signing in goes through Better Auth's HTTP handler on purpose, not
 * auth.api.signInEmail: the rate limiter only runs on that path, and this is
 * the form a stranger can hammer. The handler sees the visitor's IP and
 * user agent, and its Set-Cookie headers are copied onto the response.
 *
 * No /api/auth route is mounted in this app: nothing in the browser talks to
 * auth directly, so the only doors are these server actions.
 */

async function applyCookies(res: Response): Promise<void> {
  const jar = await cookies()
  for (const line of res.headers.getSetCookie()) {
    for (const [name, attrs] of parseSetCookieHeader(line)) {
      jar.set(name, attrs.value, toCookieOptions(attrs))
    }
  }
}

async function throughHandler(path: string, body: unknown): Promise<Response> {
  const h = await headers()
  const base = (process.env.BETTER_AUTH_URL ?? '').replace(/\/+$/, '')
  const res = await auth.handler(
    new Request(`${base}/api/auth${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: base,
        'x-forwarded-for': h.get('x-forwarded-for') ?? '',
        'user-agent': h.get('user-agent') ?? '',
      },
      body: JSON.stringify(body),
    }),
  )
  await applyCookies(res)
  return res
}

export type SignInResult = 'ok' | 'wrong' | 'throttled'

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const res = await throughHandler('/sign-in/email', { email, password })
  if (res.ok) return 'ok'
  return res.status === 429 ? 'throttled' : 'wrong'
}

/**
 * Create an account. Only called after the invite code was checked; the
 * sign-up endpoint itself refuses requests (lib/auth/server.ts), so this
 * server-side call is the only way an account comes into being.
 */
export async function signUp(email: string, password: string): Promise<{ ok: true } | { ok: false; taken: boolean }> {
  try {
    await auth.api.signUpEmail({ body: { email, password, name: email.split('@')[0] ?? email } })
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    return { ok: false, taken: /already|exist/i.test(msg) }
  }
}

export async function signOut(): Promise<void> {
  try {
    const out = await auth.api.signOut({ headers: await headers(), asResponse: true })
    await applyCookies(out)
  } catch {
    // No session left to end; the redirect to /login is still right.
  }
}
