import { afterEach, describe, expect, it, vi } from 'vitest'
import { contentSecurityPolicy, MAP_TILES } from './csp'

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
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcd.supabase.co')
    const connect = directives(contentSecurityPolicy('n0nce')).get('connect-src')
    expect(connect).toEqual(["'self'", 'https://abcd.supabase.co', MAP_TILES])
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

  it('never names a Supabase origin it could not parse', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'not a url')
    expect(directives(contentSecurityPolicy('n0nce')).get('connect-src')).toEqual(["'self'", MAP_TILES])
  })
})
