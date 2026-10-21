import { config } from 'dotenv'
import postgres from 'postgres'

/**
 * One-off copy of the production data from Supabase into a migrated Neon branch.
 *
 *   SOURCE_DATABASE_URL   Supabase, DIRECT connection (read only here)
 *   DATABASE_URL          Neon target, direct endpoint, prelude + migrations 0000..0016 applied
 *   IMPORT_ALLOW_REMOTE=1 required for a non-local target
 *
 *   pnpm db:import-supabase [--kering]
 *
 * Same script as NDS-ETL's web/db/impor-supabase.ts, rehearsed there against a
 * fake Supabase (see that repo's web/db/README.md); adapted to this schema.
 *
 * --kering (dry run) reads everything and writes it inside a transaction that is
 * rolled back, then prints the same count comparison. Use it first.
 *
 * What it does, in one transaction on the target:
 *   1. Refuses unless the target has migration 0016 and no users yet: this is a
 *      copy into an empty schema, never a merge.
 *   2. Turns off user triggers on every table it writes. Otherwise
 *      handle_new_user would create a second profile/subscription/settings for
 *      every imported user, notify_on_run_outcome would raise a notification for
 *      every historical run, and touch_* would rewrite every updated_at.
 *   3. auth.users from GoTrue's auth.users: same uuid, email lower-cased, name
 *      from the address, email_verified from email_confirmed_at. GoTrue bans are
 *      not carried (this app never used them). The bcrypt hash goes to auth.accounts
 *      as the credential password, which lib/auth/server.ts verifies, so nobody
 *      has to reset. Users who never set one (open invites) get no account row:
 *      exactly how an invite looks in Better Auth.
 *   4. Every public table in foreign-key order, all columns the target has,
 *      in batches (snapshots and action_plans carry large blobs).
 *   5. Every sequence set to the source's position, ticket_number_seq included,
 *      so the next ticket and every serial id continue where Supabase stopped.
 *   6. Row counts AND an md5 of every row's content compared per table; any
 *      mismatch aborts the whole copy.
 *
 * Not copied: GoTrue sessions (everyone signs in once) and the Supabase-only
 * schemas. This app never used Supabase Storage (logos live in accounts.logo).
 */

const BATCH = 200
const BATCH_BLOB = 10
const BLOB_TABLES = new Set(['snapshots', 'action_plans', 'run_debug', 'derived_cache'])

type Sql = ReturnType<typeof postgres>
type Tx = postgres.TransactionSql
type Row = Record<string, unknown>

class Kering extends Error {}

function wajib(nama: string): string {
  const v = process.env[nama]
  if (!v) throw new Error(`${nama} belum diset`)
  return v
}

/** Public tables ordered so every foreign key points at a table already loaded. */
async function urutanTabel(t: Tx): Promise<string[]> {
  const tabel = (
    await t<{ relname: string }[]>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`
  ).map((r) => r.relname)
  const fk = await t<{ dari: string; ke: string }[]>`
    SELECT cf.relname AS dari, ct.relname AS ke
    FROM pg_constraint k
    JOIN pg_class cf ON cf.oid = k.conrelid JOIN pg_namespace nf ON nf.oid = cf.relnamespace
    JOIN pg_class ct ON ct.oid = k.confrelid JOIN pg_namespace nt ON nt.oid = ct.relnamespace
    WHERE k.contype = 'f' AND nf.nspname = 'public' AND nt.nspname = 'public' AND cf.relname <> ct.relname`
  const butuh = new Map(tabel.map((x) => [x, new Set<string>()]))
  for (const { dari, ke } of fk) butuh.get(dari)?.add(ke)
  const hasil: string[] = []
  const sisa = new Set(tabel)
  while (sisa.size > 0) {
    const siap = [...sisa].filter((x) => [...(butuh.get(x) ?? [])].every((d) => !sisa.has(d))).sort()
    if (siap.length === 0) throw new Error(`siklus foreign key di antara: ${[...sisa].join(', ')}`)
    for (const x of siap) {
      hasil.push(x)
      sisa.delete(x)
    }
  }
  return hasil
}

async function kolomTarget(
  t: Tx,
  tabel: string,
): Promise<{ name: string; type: string; generated: boolean }[]> {
  return t<{ name: string; type: string; generated: boolean }[]>`
    SELECT attname AS name, format_type(atttypid, atttypmod) AS type,
           (attgenerated <> '' OR attidentity = 'a') AS generated
    FROM pg_attribute WHERE attrelid = ${`public.${tabel}`}::regclass AND attnum > 0 AND NOT attisdropped
    ORDER BY attnum`
}

/**
 * Same content, not just the same count: an md5 over every copied column of
 * every row, in primary-key order, computed by each server on its own data.
 * json/jsonb compare by their canonical text, which both sides produce alike.
 */
async function isiSama(src: Sql, t: Tx, tabel: string, kolom: string[]): Promise<boolean> {
  if (kolom.length === 0) return true
  const [pk] = await t<{ cols: string | null }[]>`
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY array_position(i.indkey, a.attnum)) AS cols
    FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = ${`public.${tabel}`}::regclass AND i.indisprimary`
  const urut = pk?.cols ?? kolom.map((k) => `"${k}"`).join(', ')
  const baris = `ROW(${kolom.map((k) => `"${k.replace(/"/g, '""')}"`).join(', ')})::text`
  const q = `SELECT coalesce(md5(string_agg(${baris}, '|' ORDER BY ${urut})), '') AS h FROM public."${tabel}"`
  // timestamptz renders in the session's time zone (local cluster WIB, Neon
  // GMT): pin both to UTC or equal data hashes differently.
  const [a] = await src.begin('read only', async (s) => {
    await s`SET LOCAL TIME ZONE 'UTC'`
    return s.unsafe<{ h: string }[]>(q)
  })
  await t`SET LOCAL TIME ZONE 'UTC'`
  const [b] = await t.unsafe<{ h: string }[]>(q)
  return a?.h === b?.h
}

async function salinTabel(
  src: Sql,
  t: Tx,
  tabel: string,
): Promise<{ sumber: number; target: number; sama: boolean }> {
  const tipeSrc = new Map(
    (
      await src<{ column_name: string; data_type: string }[]>`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tabel}`
    ).map((r) => [r.column_name, r.data_type]),
  )
  if (tipeSrc.size === 0) return { sumber: 0, target: 0, sama: true }
  const target = (await kolomTarget(t, tabel)).filter((c) => !c.generated && tipeSrc.has(c.name))
  const kolom = target.map((c) => c.name)
  // Every value travels as Postgres' own text form and is cast back by the
  // target server. Parsed by the driver instead, timestamptz loses its
  // microseconds (JS Date is milliseconds), and json typed as jsonb gets
  // JSON-encoded a second time. Both were caught by the checksum step below.
  const q = (k: string) => `"${k.replace(/"/g, '""')}"`
  const pilih = kolom.map((k) => `${q(k)}::text AS ${q(k)}`).join(', ')
  const sisip = target.map((c, i) => `$${i + 1}::text::${c.type}`).join(', ')
  const insertSql = `INSERT INTO public."${tabel}" (${kolom.map(q).join(', ')}) VALUES (${sisip})`
  const ukuran = BLOB_TABLES.has(tabel) ? BATCH_BLOB : BATCH
  let sumber = 0
  // A cursor, so a 170 MB table never sits in memory at once. Iterated with
  // for await, not cursor(n, callback): the callback form resolves before the
  // last batch's async work is done, which the dry run caught as "every full
  // batch copied, only the first row of the last one".
  await src.begin('read only', async (s) => {
    for await (const rows of s.unsafe(`SELECT ${pilih} FROM public."${tabel}"`).cursor(ukuran)) {
      sumber += rows.length
      for (const r of rows as Row[]) {
        await t.unsafe(insertSql, kolom.map((k) => r[k]) as postgres.ParameterOrJSON<never>[])
      }
    }
  })
  const [{ n }] = await t<{ n: number }[]>`SELECT count(*)::int AS n FROM ${t('public.' + tabel)}`
  return { sumber, target: n, sama: await isiSama(src, t, tabel, kolom) }
}

async function main() {
  const kering = process.argv.includes('--kering')
  const sumberUrl = wajib('SOURCE_DATABASE_URL')
  config({ path: '.env.local', quiet: true })
  const targetUrl = wajib('DATABASE_URL')
  const host = new URL(targetUrl).hostname
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && process.env.IMPORT_ALLOW_REMOTE !== '1') {
    throw new Error(
      `DATABASE_URL menunjuk ${host}. Impor menulis seluruh data ke sana; ulangi dengan IMPORT_ALLOW_REMOTE=1.`,
    )
  }

  const src = postgres(sumberUrl, { max: 2, prepare: false, onnotice: () => {} })
  const dst = postgres(targetUrl, { max: 1, prepare: false, onnotice: () => {} })
  const laporan: string[] = []
  let beda = 0

  try {
    await dst.begin(async (t) => {
      // 1. Empty, migrated target only.
      const [mig] = await t<{ ada: boolean }[]>`
        SELECT (SELECT count(*) FROM drizzle.__drizzle_migrations) >= 17 AS ada`
      if (!mig?.ada) throw new Error('Target belum dimigrasi sampai 0016. Jalankan pnpm db:migrate dulu.')
      const [isi] = await t<{ n: number }[]>`SELECT count(*)::int AS n FROM auth.users`
      if ((isi?.n ?? 0) > 0)
        throw new Error(`Target sudah berisi ${isi?.n} user. Impor hanya ke skema kosong.`)

      const tabel = await urutanTabel(t)

      // 2. User triggers off, for this transaction only (ALTER TABLE is
      // transactional; a rollback turns them back on).
      for (const x of [...tabel.map((n) => `public.${n}`), 'auth.users']) {
        await t.unsafe(`ALTER TABLE ${x} DISABLE TRIGGER USER`)
      }

      // 3. Users.
      const users = await src<
        {
          id: string
          email: string | null
          encrypted_password: string | null
          email_confirmed_at: Date | null
          created_at: string | null
          updated_at: string | null
        }[]
      >`
        SELECT u.id, u.email, u.encrypted_password, u.email_confirmed_at,
               u.created_at::text AS created_at, u.updated_at::text AS updated_at
        FROM auth.users u
        WHERE u.deleted_at IS NULL`
      const tanpaEmail = users.filter((u) => !u.email)
      if (tanpaEmail.length > 0)
        throw new Error(`${tanpaEmail.length} user tanpa email di sumber; periksa manual.`)
      for (const u of users) {
        const email = (u.email ?? '').toLowerCase()
        await t`
          INSERT INTO auth.users (id, name, email, email_verified, created_at, updated_at)
          VALUES (${u.id}, ${email.split('@')[0] ?? ''}, ${email}, ${u.email_confirmed_at !== null},
                  coalesce(${u.created_at}::timestamptz, now()), coalesce(${u.updated_at}::timestamptz, now()))`
        if (u.encrypted_password) {
          await t`
            INSERT INTO auth.accounts (account_id, provider_id, user_id, password)
            VALUES (${u.id}, 'credential', ${u.id}, ${u.encrypted_password})`
        }
      }
      const denganSandi = users.filter((u) => u.encrypted_password).length
      laporan.push(
        `auth.users       ${users.length} user, ${denganSandi} dengan sandi, ${users.length - denganSandi} undangan terbuka`,
      )

      // 4. Public tables.
      for (const x of tabel) {
        const { sumber, target, sama } = await salinTabel(src, t, x)
        const ok = sumber === target && sama
        if (!ok) beda++
        laporan.push(
          `${x.padEnd(24)} ${String(sumber).padStart(7)} -> ${String(target).padStart(7)}` +
            (sumber !== target ? '  BEDA JUMLAH' : sama ? '  isi sama' : '  BEDA ISI'),
        )
      }

      // 5. Sequences.
      const seqs = await t<{ nama: string }[]>`
        SELECT c.relname AS nama FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'S'`
      for (const { nama } of seqs) {
        const [s] = await src<{ last_value: string; is_called: boolean }[]>`
          SELECT last_value, is_called FROM ${src('public.' + nama)}`.catch(() => [] as never[])
        if (!s) continue
        await t`SELECT setval(${`public.${nama}`}, ${Number(s.last_value)}, ${s.is_called})`
        laporan.push(`seq ${nama.padEnd(28)} ${s.last_value}${s.is_called ? '' : ' (belum dipakai)'}`)
      }

      for (const x of [...tabel.map((n) => `public.${n}`), 'auth.users']) {
        await t.unsafe(`ALTER TABLE ${x} ENABLE TRIGGER USER`)
      }

      // 6. All or nothing.
      if (beda > 0) throw new Error(`${beda} tabel jumlah atau isinya beda; semua dibatalkan.`)
      if (kering) throw new Kering()
    })
  } catch (e) {
    if (!(e instanceof Kering)) {
      console.log(laporan.join('\n'))
      throw e
    }
  } finally {
    await src.end()
    await dst.end()
  }

  console.log(laporan.join('\n'))
  console.log(
    kering
      ? '\nKERING: semua terbaca dan cocok, lalu di-rollback. Ulangi tanpa --kering.'
      : '\nImpor selesai dan di-commit.',
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
