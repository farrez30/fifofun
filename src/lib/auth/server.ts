import { APIError, betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { nextCookies } from 'better-auth/next-js'
import bcrypt from 'bcryptjs'
import { db } from '@/db/client'
import * as schema from '@/db/schema-auth'

/**
 * Better Auth, replacing Supabase Auth.
 *
 * Users, sessions and password hashes live in auth.* in our own Neon database.
 * The browser only holds an httpOnly session cookie.
 *
 *  - Sign-up is closed over HTTP. The only way in is the sign-up branch of
 *    app/login/actions.ts, which checks the invite code first and calls
 *    auth.api.signUpEmail from the server. The hook below refuses the same
 *    endpoint when it arrives as a request, so nobody can skip the invite.
 *  - Old passwords keep working: users moved from Supabase carry GoTrue's
 *    bcrypt hash, verified with bcrypt; new ones are Better Auth's scrypt.
 *  - Ids are the old Supabase uuids (generateId "uuid"), so household_members
 *    and the invite foreign keys did not change.
 *  - Rate limits live in the database: Vercel runs many instances.
 */

const BUILDING = process.env.NEXT_PHASE === 'phase-production-build'
function requiredEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (v) return v
  // `next build` imports routes with no runtime env; nothing is signed then.
  if (BUILDING) return name === 'BETTER_AUTH_URL' ? 'http://localhost:3000' : 'build-placeholder-secret-0123456789abcdef'
  throw new Error(`${name} is not set`)
}

export const auth = betterAuth({
  appName: 'FiFoFun',
  baseURL: requiredEnv('BETTER_AUTH_URL'),
  secret: requiredEnv('BETTER_AUTH_SECRET'),
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  advanced: {
    database: { generateId: 'uuid' },
    // Vercel overwrites X-Forwarded-For; without this every request
    // rate-limits as one IP.
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
  },
  emailAndPassword: {
    enabled: true,
    // The sign-up action signs in through the rate-limited handler right
    // after (lib/auth/gerbang.ts); a second, silent session is not wanted.
    autoSignIn: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      hash: hashPassword,
      async verify({ hash, password }) {
        if (/^\$2[aby]\$/.test(hash)) return bcrypt.compare(password, hash)
        return verifyPassword({ hash, password })
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-up/email' && ctx.request) {
        throw new APIError('FORBIDDEN', { message: 'Pendaftaran hanya lewat kode undangan.' })
      }
    }),
  },
  plugins: [nextCookies()],
})
