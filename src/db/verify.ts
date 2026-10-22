import { createHash } from 'node:crypto'
import { config } from 'dotenv'
import postgres from 'postgres'

/**
 * Proves the household isolation on a migrated database, as the role the app
 * uses (`authenticated`, auth.uid() set per transaction). Everything runs in
 * one transaction that is always rolled back.
 *
 * On Supabase these rules were enforced through PostgREST and GoTrue; on Neon
 * the same policies only hold if `authenticated`, auth.uid() and the grants in
 * drizzle/0016 are wired right. A mistake there does not error, it quietly
 * lets one household read another's money, so each rule is checked both ways.
 *
 *   DATABASE_URL=<direct endpoint> VERIFY_ALLOW_REMOTE=1 pnpm db:verify
 */

let failed = 0
function report(ok: boolean, name: string, detail = ''): void {
  if (!ok) failed++
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

class Rollback extends Error {}
type Tx = postgres.TransactionSql

async function as(tx: Tx, userId: string | null): Promise<void> {
  await tx`SELECT set_config('app.user_id', ${userId ?? ''}, true), set_config('role', 'authenticated', true)`
}
async function owner(tx: Tx): Promise<void> {
  await tx.unsafe('RESET ROLE')
  await tx`SELECT set_config('app.user_id', '', true)`
}

async function refused(tx: Tx, name: string, code: string, f: (t: Tx) => Promise<unknown>): Promise<void> {
  try {
    await tx.savepoint(async (sp) => {
      await f(sp as unknown as Tx)
    })
    report(false, name, 'went through')
  } catch (e) {
    const c = (e as { code?: string }).code
    report(c === code, name, c === code ? `refused ${c}` : `code ${c}: ${(e as Error).message}`)
  }
}

async function main(): Promise<void> {
  config({ path: '.env.local', quiet: true })
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const host = new URL(url).hostname
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && process.env.VERIFY_ALLOW_REMOTE !== '1') {
    throw new Error(`DATABASE_URL points at ${host}. Rerun with VERIFY_ALLOW_REMOTE=1 to verify it (writes are rolled back).`)
  }
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })

  try {
    await sql.begin(async (tx) => {
      const [a] = await tx<{ id: string }[]>`INSERT INTO auth.users (name, email) VALUES ('A', 'verify-a@contoh.test') RETURNING id`
      const [b] = await tx<{ id: string }[]>`INSERT INTO auth.users (name, email) VALUES ('B', 'verify-b@contoh.test') RETURNING id`
      const [c] = await tx<{ id: string }[]>`INSERT INTO auth.users (name, email) VALUES ('C', 'verify-c@contoh.test') RETURNING id`
      if (!a || !b || !c) throw new Error('could not create test users')
      const [ha] = await tx<{ id: string }[]>`INSERT INTO public.households (name) VALUES ('Rumah A') RETURNING id`
      const [hb] = await tx<{ id: string }[]>`INSERT INTO public.households (name) VALUES ('Rumah B') RETURNING id`
      if (!ha || !hb) throw new Error('could not create test households')
      await tx`INSERT INTO public.household_members (household_id, user_id, role) VALUES (${ha.id}, ${a.id}, 'owner'), (${hb.id}, ${b.id}, 'owner')`
      await tx`INSERT INTO public.accounts (household_id, name, kind) VALUES (${ha.id}, 'BCA A', 'bank'), (${hb.id}, 'BCA B', 'bank')`
      const [bcaB] = await tx<{ id: string }[]>`SELECT id FROM public.accounts WHERE household_id = ${hb.id}`
      await tx`INSERT INTO public.transactions (household_id, occurred_at, description, amount, cashflow, source, to_account_id)
               VALUES (${hb.id}, now(), 'gaji B', 1000000000, 'income', 'manual', ${bcaB?.id ?? null})`
      const code = 'VERIFYCODE'
      const hash = createHash('sha256').update(code).digest('hex')
      await tx`INSERT INTO public.household_invites (household_id, code_hash, expires_at, created_by)
               VALUES (${ha.id}, ${hash}, now() + interval '1 day', ${a.id})`

      console.log('As user A')
      await as(tx, a.id)
      const homes = await tx<{ id: string }[]>`SELECT id FROM public.households`
      report(homes.length === 1 && homes[0]?.id === ha.id, 'sees only household A', `${homes.length} row(s)`)
      const accts = await tx<{ name: string }[]>`SELECT name FROM public.accounts`
      report(accts.length === 1 && accts[0]?.name === 'BCA A', 'sees only household A accounts')
      const txns = await tx`SELECT id FROM public.transactions`
      report(txns.length === 0, "does not see household B's transactions")
      await refused(tx, "inserts an account into household B", '42501', (t) =>
        t`INSERT INTO public.accounts (household_id, name, kind) VALUES (${hb.id}, 'curi', 'bank')`)
      const upd = await tx`UPDATE public.transactions SET amount = 1 WHERE household_id = ${hb.id} RETURNING id`
      report(upd.length === 0, "cannot change household B's transactions", `${upd.length} row(s)`)
      await refused(tx, 'deletes a household (no policy, no grant)', '42501', (t) => t`DELETE FROM public.households WHERE id = ${ha.id}`)
      await refused(tx, 'reads password hashes in auth.accounts', '42501', (t) => t`SELECT password FROM auth.accounts`)
      await refused(tx, 'reads auth.sessions', '42501', (t) => t`SELECT token FROM auth.sessions`)
      await refused(tx, 'TRUNCATE', '42501', (t) => t`TRUNCATE public.transactions`)
      await owner(tx)

      console.log('As user C (no household yet)')
      await as(tx, c.id)
      const none = await tx`SELECT id FROM public.accounts`
      report(none.length === 0, 'sees no accounts before joining')
      const [open] = await tx<{ open: boolean }[]>`SELECT public.invite_is_open(p_code_hash => ${hash}) AS open`
      report(open?.open === true, 'invite_is_open answers for an open code')
      const [res] = await tx<{ r: string }[]>`SELECT public.redeem_invite(p_code_hash => ${hash}) AS r`
      report(res?.r === 'ok', 'redeem_invite joins household A', res?.r)
      const after = await tx<{ name: string }[]>`SELECT name FROM public.accounts`
      report(after.length === 1 && after[0]?.name === 'BCA A', 'now sees household A, still not B')
      const [again] = await tx<{ r: string }[]>`SELECT public.redeem_invite(p_code_hash => ${hash}) AS r`
      report(again?.r === 'already_member', 'a spent code cannot be used twice', again?.r)
      await owner(tx)

      console.log('With no user (app.user_id empty)')
      await as(tx, null)
      const anon = await tx`SELECT id FROM public.households`
      report(anon.length === 0, 'sees no households')
      await owner(tx)

      console.log('Grants')
      const [acl] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_default_acl
        WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)`
      report(acl?.n === 0, 'no default privileges: a new table needs its own GRANT')

      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  } finally {
    await sql.end()
  }

  console.log(failed === 0 ? '\nEvery access rule holds (test data rolled back).' : `\n${failed} check(s) failed.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
