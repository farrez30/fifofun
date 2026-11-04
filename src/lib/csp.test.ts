import { afterEach, describe, expect, it, vi } from 'vitest'
import { contentSecurityPolicy, MAP_TILES, PORTFOLIO, PORTFOLIO_DEV } from './csp'

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/)
      return [name, values]
    }),
  )
}

describe('contentSecurityPolicy', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('lets the map reach its tile host and nothing wider', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const connect = directives(contentSecurityPolicy('n0nce')).get('connect-src')
    // Nothing but this origin and the tiles: the browser no longer talks to an
    // auth or database host directly (Supabase is gone; auth is server-side).
    expect(connect).toEqual(["'self'", MAP_TILES])
    expect(connect?.some((source) => source.includes('*'))).toBe(false)
    expect(connect?.some((source) => source.includes('nominatim'))).toBe(false)
  })

  it('keeps workers same-origin, with no blob: escape hatch', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(directives(contentSecurityPolicy('n0nce')).get('worker-src')).toEqual(["'self'"])
  })

  it('carries the nonce on scripts and style elements in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const policy = directives(contentSecurityPolicy('n0nce'))
    expect(policy.get('script-src')).toEqual(["'self'", "'nonce-n0nce'"])
    expect(policy.get('style-src-elem')).toEqual(["'self'", "'nonce-n0nce'"])
    expect(policy.has('upgrade-insecure-requests')).toBe(true)
  })
  it('lets only this origin and the portfolio frame the app in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const ancestors = directives(contentSecurityPolicy('n0nce')).get('frame-ancestors')
    expect(ancestors).toEqual(["'self'", PORTFOLIO])
    expect(ancestors?.some((source) => source.includes('localhost'))).toBe(false)
    expect(ancestors?.some((source) => source.includes('*'))).toBe(false)
  })

  it('also lets the local portfolio preview frame it in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const ancestors = directives(contentSecurityPolicy('n0nce')).get('frame-ancestors')
    expect(ancestors).toEqual(["'self'", PORTFOLIO, PORTFOLIO_DEV])
  })
})
