import { createHash, randomInt } from 'node:crypto'

/**
 * Invite codes.
 *
 * Registration is closed except to somebody holding a code an existing member
 * issued. The code is the only thing standing between a public deployment and
 * anyone at all creating an account, so it is generated here rather than typed
 * by a person: a memorable code is a guessable one.
 */

/*
  No I, L, O, 0 or 1.

  Two of those pairs are indistinguishable in most sans-serif faces, and this
  code gets read off one screen and typed into another. Confusables are dropped
  from the alphabet rather than mapped back on input, because a mapping has to
  guess which of the pair was meant and guessing wrong turns a valid code into
  a wrong one, which is worse than asking for it again.
*/
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Characters in a code, not counting the separator. */
const LENGTH = 10

/**
 * Entropy: 31^10, a little over fifty bits.
 *
 * That is what makes a brute force through `invite_is_open` pointless without
 * a rate limit standing in front of it, which is the reason there is not one.
 * Ten characters is also short enough to read aloud over a phone.
 */
export const CODE_ENTROPY_BITS = Math.round(LENGTH * Math.log2(ALPHABET.length))

/** How long a freshly issued code stays usable. */
export const INVITE_TTL_DAYS = 7

export function generateCode(): string {
  let code = ''
  // randomInt, not Math.random: this value is the whole of the access control.
  for (let index = 0; index < LENGTH; index += 1) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

/**
 * What someone typed, reduced to what was issued.
 *
 * Case and separators are forgiven because they are how the code was displayed,
 * not part of it. Nothing else is: a character outside the alphabet was never
 * in a code, and silently dropping it would let two different strings redeem
 * the same invite.
 */
export function normaliseCode(input: string): string | null {
  const stripped = input.toUpperCase().replace(/[\s-]/g, '')
  if (stripped.length !== LENGTH) return null
  if (![...stripped].every((ch) => ALPHABET.includes(ch))) return null
  return stripped
}

/** How the code is shown and printed: two groups of five. */
export function formatCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`
}

/**
 * What the database stores.
 *
 * SHA-256 rather than a password hash, and that is deliberate rather than a
 * shortcut. Slow hashing exists to make guessing a human-chosen secret
 * expensive; this secret is fifty random bits, so there is no dictionary to
 * walk and nothing for the work factor to buy. Hashing at all is what stops a
 * leaked table from being a set of working codes.
 */
export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export function expiryFrom(now: Date, days = INVITE_TTL_DAYS): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}

export type InviteState = 'open' | 'redeemed' | 'expired'

export interface InviteRow {
  id: string
  createdAt: Date
  expiresAt: Date
  redeemedAt: Date | null
}

/** An invite is expired only while it is still unredeemed. */
export function stateOf(invite: InviteRow, now: Date): InviteState {
  if (invite.redeemedAt) return 'redeemed'
  return invite.expiresAt <= now ? 'expired' : 'open'
}
