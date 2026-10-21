import { bigint, boolean, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Better Auth's view of the auth.* tables (drizzle/prelude-neon.sql and
 * migration 0016). Not part of schema.ts on purpose: drizzle-kit only manages
 * `public` (drizzle.config.ts), and these tables are created by hand-written
 * SQL. Property names are Better Auth's field names; the strings are the
 * snake_case columns. Timestamps are `Date` because Better Auth compares them.
 */

const auth = pgSchema('auth')
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const user = auth.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
})

export const session = auth.table('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  expiresAt: at('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: uuid('user_id').notNull(),
})

export const account = auth.table('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: uuid('user_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: at('access_token_expires_at'),
  refreshTokenExpiresAt: at('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
})

export const verification = auth.table('verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: at('expires_at').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
})

export const rateLimit = auth.table('rate_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})
