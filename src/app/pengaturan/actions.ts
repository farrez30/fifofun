'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SESSION_EXPIRED, context, fail, isoDateField, senField, type ActionResult } from '@/lib/actions'
import { ICON_NAMES } from '@/components/marks'
import { ACCOUNT_KEYS, parseIdentifiers, planReorder, twinsOf } from '@/lib/ledger/settings'
import { ACCOUNT_KINDS, CASHFLOW_LABELS, CASHFLOW_TYPES, type CashflowType } from '@/lib/ledger/types'

/**
 * Managing the two tables everything else refers to.
 *
 * Renaming is safe and archiving is reversible, which is the whole point: a
 * household should be able to call an account whatever it calls it without
 * wondering whether an import will stop working. What is not safe is hidden
 * behind a refusal rather than behind a warning:
 *
 *   - a category's cashflow is frozen once anything has been filed under it,
 *     because the cashflow is copied onto every transaction and the account
 *     sides were derived from it;
 *   - an import key belongs to one account at a time, so the statement and the
 *     bot cannot be pointed at two places at once;
 *   - a savings pot and the cashflow money leaves it by are renamed together,
 *     because the funds panel pairs them by name.
 *
 * Nothing is ever deleted. Archiving sets a date and takes the row out of every
 * picker; the transactions filed against it stay exactly where they are, which
 * is the only way the totals for a past month can stay what they were.
 */

/** The client `context()` hands back, so the helpers below can take it. */
type SupabaseLike = NonNullable<Awaited<ReturnType<typeof context>>>['supabase']

const MAX_NAME = 60

const nameField = z.string().trim().min(1, 'Namanya belum diisi.').max(MAX_NAME)

const hueField = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value)))
  .pipe(z.number().int().min(0).max(359).nullable())

const accountSchema = z.object({
  id: z.uuid().optional(),
  name: nameField,
  kind: z.enum(ACCOUNT_KINDS),
  institution: z.string().trim().max(MAX_NAME),
  key: z.enum(ACCOUNT_KEYS).or(z.literal('')),
  openingBalance: senField,
  openingBalanceAt: isoDateField.or(z.literal('')),
})

const categorySchema = z.object({
  id: z.uuid().optional(),
  name: nameField,
  cashflow: z.enum(CASHFLOW_TYPES),
  icon: z.enum(ICON_NAMES as [string, ...string[]]).or(z.literal('')),
  hue: hueField,
})

/** Indonesian case-insensitive comparison, which is what a person means by "same name". */
function sameName(a: string, b: string): boolean {
  return a.localeCompare(b, 'id', { sensitivity: 'base' }) === 0
}

interface AccountRecord {
  id: string
  name: string
  kind: string
  key: string | null
  sortOrder: number
  archivedAt: string | null
  openingBalance: string
}

async function accountsOf(supabase: SupabaseLike, householdId: string): Promise<AccountRecord[]> {
  const { data } = await supabase
    .from('accounts')
    .select('id, name, kind, key, sort_order, archived_at, opening_balance')
    .eq('household_id', householdId)
    .order('sort_order')
    .order('name')

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as string,
    key: (row.key as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    archivedAt: (row.archived_at as string | null) ?? null,
    openingBalance: String(row.opening_balance ?? '0'),
  }))
}

interface CategoryRecord {
  id: string
  name: string
  cashflow: CashflowType
  sortOrder: number
  archivedAt: string | null
}

async function categoriesOf(
  supabase: SupabaseLike,
  householdId: string,
): Promise<CategoryRecord[]> {
  const { data } = await supabase
    .from('categories')
    .select('id, name, cashflow, sort_order, archived_at')
    .eq('household_id', householdId)
    .order('sort_order')
    .order('name')

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    cashflow: row.cashflow as CashflowType,
    sortOrder: Number(row.sort_order ?? 0),
    archivedAt: (row.archived_at as string | null) ?? null,
  }))
}

export async function createAccount(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = accountSchema.safeParse(readAccount(formData))
  if (!parsed.success) return fail('Akunnya belum bisa disimpan.', parsed.error.issues[0]?.message)

  const identifiers = parseIdentifiers(String(formData.get('ownIdentifiers') ?? ''))
  if (!identifiers.ok) return fail('Nomor e-walletnya belum bisa dibaca.', identifiers.reason)

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const values = parsed.data
  const existing = await accountsOf(ctx.supabase, ctx.householdId)
  if (existing.some((row) => sameName(row.name, values.name))) {
    return fail(
      `Sudah ada akun bernama ${values.name}.`,
      'Nama akun dipakai untuk membedakan saldo di tabel, jadi dua akun bernama sama akan terbaca sebagai satu.',
    )
  }

  const { error } = await ctx.supabase
    .from('accounts')
    .insert({
      household_id: ctx.householdId,
      name: values.name,
      kind: values.kind,
      institution: values.institution || null,
      key: values.key || null,
      opening_balance: values.openingBalance.toString(),
      opening_balance_at: values.openingBalanceAt || null,
      own_identifiers: values.kind === 'bank' ? identifiers.values : [],
      sort_order: existing.length + 1,
    })
    .select('id')

  if (error) return keyClash(error, values.key) ?? fail('Akunnya gagal disimpan.', error.message)

  revalidateSettings()
  return { ok: true, message: `Akun ${values.name} dibuat.` }
}

export async function updateAccount(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = accountSchema.safeParse(readAccount(formData))
  if (!parsed.success || !parsed.data.id) {
    return fail('Akunnya belum bisa disimpan.', parsed.success ? undefined : parsed.error.issues[0]?.message)
  }

  const identifiers = parseIdentifiers(String(formData.get('ownIdentifiers') ?? ''))
  if (!identifiers.ok) return fail('Nomor e-walletnya belum bisa dibaca.', identifiers.reason)

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const values = parsed.data
  const rows = await accountsOf(ctx.supabase, ctx.householdId)
  const current = rows.find((row) => row.id === values.id)
  if (!current) return fail('Akun itu tidak ditemukan.')

  if (rows.some((row) => row.id !== values.id && sameName(row.name, values.name))) {
    return fail(`Sudah ada akun bernama ${values.name}.`)
  }

  /*
    The statement importer files every bank-side row against the account
    holding the `mandiri` key, and a cash or e-wallet account cannot carry the
    two sides a bank row needs. Letting the kind change here would break the
    next import with a constraint error rather than with a sentence.
  */
  if (current.key === 'mandiri' && values.kind !== 'bank') {
    return fail(
      'Rekening dengan kunci mandiri harus tetap berjenis Bank.',
      'Lepas dulu kunci impornya kalau akun ini memang bukan rekening bank lagi.',
    )
  }

  const { data, error } = await ctx.supabase
    .from('accounts')
    .update({
      name: values.name,
      kind: values.kind,
      institution: values.institution || null,
      key: values.key || null,
      opening_balance: values.openingBalance.toString(),
      opening_balance_at: values.openingBalanceAt || null,
      own_identifiers: values.kind === 'bank' ? identifiers.values : [],
    })
    .eq('id', values.id)
    .eq('household_id', ctx.householdId)
    .select('id')

  if (error) return keyClash(error, values.key) ?? fail('Akunnya gagal disimpan.', error.message)
  if (!data || data.length === 0) return fail('Akun itu tidak ditemukan.')

  revalidateSettings()
  return {
    ok: true,
    message: `Akun ${values.name} disimpan.`,
    detail:
      current.openingBalance === values.openingBalance.toString()
        ? undefined
        : 'Saldo awal menggeser saldo akun ini di semua bulan. Koreksi untuk dompet yang sudah berjalan dicatat lewat Sesuaikan saldo di Ringkasan.',
  }
}

export async function setAccountArchived(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.uuid().safeParse(formData.get('id'))
  if (!id.success) return fail('Akun itu tidak ditemukan.')
  const archive = formData.get('archived') === '1'

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const rows = await accountsOf(ctx.supabase, ctx.householdId)
  const current = rows.find((row) => row.id === id.data)
  if (!current) return fail('Akun itu tidak ditemukan.')

  const { data, error } = await ctx.supabase
    .from('accounts')
    // An archived account keeps no import key: the statement would otherwise
    // still be filed against an account nobody can see any more.
    .update(archive ? { archived_at: new Date().toISOString(), key: null } : { archived_at: null })
    .eq('id', id.data)
    .eq('household_id', ctx.householdId)
    .select('id')

  if (error) return fail('Akunnya gagal diarsipkan.', error.message)
  if (!data || data.length === 0) return fail('Akun itu tidak ditemukan.')

  revalidateSettings()
  return {
    ok: true,
    message: archive ? `Akun ${current.name} diarsipkan.` : `Akun ${current.name} dipakai lagi.`,
    detail: archive
      ? `Transaksinya tetap dihitung; akunnya saja yang hilang dari pilihan dan dari tabel saldo.${
          current.key ? ` Kunci impornya, ${current.key}, dilepas.` : ''
        }`
      : 'Kalau akun ini yang dipakai impor, pasang lagi kunci impornya lewat Ubah.',
  }
}

export async function moveAccount(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return move(formData, 'accounts')
}

export async function moveCategory(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return move(formData, 'categories')
}

async function move(formData: FormData, table: 'accounts' | 'categories'): Promise<ActionResult> {
  const id = z.uuid().safeParse(formData.get('id'))
  const direction = z.enum(['up', 'down']).safeParse(formData.get('direction'))
  if (!id.success || !direction.success) return fail('Barisnya tidak ditemukan.')

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const rows =
    table === 'accounts'
      ? await accountsOf(ctx.supabase, ctx.householdId)
      : await categoriesOf(ctx.supabase, ctx.householdId)

  const target = rows.find((row) => row.id === id.data)
  if (!target) return fail('Barisnya tidak ditemukan.')
  if (target.archivedAt !== null) {
    return fail('Baris yang diarsipkan tidak punya urutan.', 'Pakai lagi dulu kalau mau diurutkan.')
  }

  // Archived rows are not in the list a person is looking at, so they must not
  // be in the list the positions are computed from either.
  const live = rows.filter((row) => row.archivedAt === null)
  const plan = planReorder(live, id.data, direction.data)
  if (plan.length === 0) return { ok: true, message: 'Sudah di ujung.' }

  for (const step of plan) {
    const { error } = await ctx.supabase
      .from(table)
      .update({ sort_order: step.sortOrder })
      .eq('id', step.id)
      .eq('household_id', ctx.householdId)
      .select('id')
    if (error) return fail('Urutannya gagal disimpan.', error.message)
  }

  revalidateSettings()
  return { ok: true, message: 'Urutannya disimpan.' }
}

export async function createCategory(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(readCategory(formData))
  if (!parsed.success) {
    return fail('Kategorinya belum bisa disimpan.', parsed.error.issues[0]?.message)
  }

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const values = parsed.data
  const rows = await categoriesOf(ctx.supabase, ctx.householdId)
  if (rows.some((row) => row.cashflow === values.cashflow && sameName(row.name, values.name))) {
    return fail(`Sudah ada kategori ${values.name} di ${CASHFLOW_LABELS[values.cashflow]}.`)
  }

  const { error } = await ctx.supabase
    .from('categories')
    .insert({
      household_id: ctx.householdId,
      name: values.name,
      cashflow: values.cashflow,
      icon: values.icon || null,
      color: values.hue === null ? null : String(values.hue),
      sort_order: rows.length + 1,
    })
    .select('id')

  if (error) {
    if (error.code === '23505') {
      return fail(`Sudah ada kategori ${values.name} di ${CASHFLOW_LABELS[values.cashflow]}.`)
    }
    return fail('Kategorinya gagal disimpan.', error.message)
  }

  revalidateSettings()
  return {
    ok: true,
    message: `Kategori ${values.name} dibuat.`,
    detail: 'Kategorinya langsung bisa dipilih di Tinjau, Catat, dan saat mengubah transaksi.',
  }
}

export async function updateCategory(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(readCategory(formData))
  if (!parsed.success || !parsed.data.id) {
    return fail(
      'Kategorinya belum bisa disimpan.',
      parsed.success ? undefined : parsed.error.issues[0]?.message,
    )
  }

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const values = parsed.data
  const rows = await categoriesOf(ctx.supabase, ctx.householdId)
  const current = rows.find((row) => row.id === values.id)
  if (!current) return fail('Kategori itu tidak ditemukan.')

  if (values.cashflow !== current.cashflow) {
    const used = await countUsage(ctx.supabase, ctx.householdId, current.id)
    if (used > 0) {
      return fail(
        'Cashflow kategori ini sudah terkunci.',
        `Sudah dipakai ${used} transaksi, dan cashflow ikut tersimpan di tiap transaksi bersama sisi akunnya. Buat kategori baru kalau arahnya memang berbeda.`,
      )
    }
  }

  /*
    A pot and the cashflow money leaves it by are one thing with two rows. The
    twins are found by the name being replaced rather than by the new one, and
    archived twins are included: a rename that skipped them would resurrect a
    mismatch the moment somebody unarchived one.
  */
  const twins = rows.filter(
    (row) =>
      row.id !== current.id &&
      sameName(row.name, current.name) &&
      twinsOf(current.cashflow).includes(row.cashflow),
  )
  const moving = [current, ...twins]

  const clash = rows.find(
    (row) =>
      !moving.some((target) => target.id === row.id) &&
      sameName(row.name, values.name) &&
      moving.some((target) => target.cashflow === row.cashflow),
  )
  if (clash) {
    return fail(
      `Sudah ada kategori ${values.name} di ${CASHFLOW_LABELS[clash.cashflow]}.`,
      twins.length > 0
        ? 'Pos tabungan diganti nama berpasangan dengan sisi pengambilannya, jadi keduanya harus muat.'
        : undefined,
    )
  }

  const { data, error } = await ctx.supabase
    .from('categories')
    .update({
      name: values.name,
      cashflow: values.cashflow,
      icon: values.icon || null,
      color: values.hue === null ? null : String(values.hue),
    })
    .eq('id', current.id)
    .eq('household_id', ctx.householdId)
    .select('id')

  if (error) return fail('Kategorinya gagal disimpan.', error.message)
  if (!data || data.length === 0) return fail('Kategori itu tidak ditemukan.')

  for (const twin of twins) {
    await ctx.supabase
      .from('categories')
      .update({ name: values.name })
      .eq('id', twin.id)
      .eq('household_id', ctx.householdId)
      .select('id')
  }

  revalidateSettings()
  return {
    ok: true,
    message: `Kategori ${values.name} disimpan.`,
    detail:
      twins.length > 0
        ? `Sisi pengambilannya ikut diganti nama, supaya pos ini tetap berpasangan.`
        : undefined,
  }
}

export async function setCategoryArchived(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.uuid().safeParse(formData.get('id'))
  if (!id.success) return fail('Kategori itu tidak ditemukan.')
  const archive = formData.get('archived') === '1'

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const rows = await categoriesOf(ctx.supabase, ctx.householdId)
  const current = rows.find((row) => row.id === id.data)
  if (!current) return fail('Kategori itu tidak ditemukan.')

  const twins = rows.filter(
    (row) =>
      row.id !== current.id &&
      sameName(row.name, current.name) &&
      twinsOf(current.cashflow).includes(row.cashflow),
  )

  const stamp = archive ? new Date().toISOString() : null
  for (const row of [current, ...twins]) {
    const { error } = await ctx.supabase
      .from('categories')
      .update({ archived_at: stamp })
      .eq('id', row.id)
      .eq('household_id', ctx.householdId)
      .select('id')
    if (error) return fail('Kategorinya gagal diarsipkan.', error.message)
  }

  revalidateSettings()
  return {
    ok: true,
    message: archive
      ? `Kategori ${current.name} diarsipkan.`
      : `Kategori ${current.name} dipakai lagi.`,
    detail: archive
      ? 'Transaksi yang sudah terlanjur memakainya tetap dihitung dan tetap bernama itu di Laporan.'
      : undefined,
  }
}

/** How many transactions ever pointed at a category, deleted ones included. */
async function countUsage(
  supabase: SupabaseLike,
  householdId: string,
  categoryId: string,
): Promise<number> {
  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('category_id', categoryId)

  return count ?? 0
}

function keyClash(error: { code?: string }, key: string): ActionResult | null {
  if (error.code !== '23505' || key === '') return null
  return fail(
    `Kunci impor ${key} sudah dipakai akun lain.`,
    'Satu kunci hanya bisa dipegang satu akun. Lepas dulu dari akun yang memegangnya.',
  )
}

function readAccount(formData: FormData) {
  const id = formData.get('id')
  return {
    ...(id ? { id } : {}),
    name: formData.get('name') ?? '',
    kind: formData.get('kind') ?? '',
    institution: formData.get('institution') ?? '',
    key: formData.get('key') ?? '',
    openingBalance: formData.get('openingBalance') ?? '0',
    openingBalanceAt: formData.get('openingBalanceAt') ?? '',
  }
}

function readCategory(formData: FormData) {
  const id = formData.get('id')
  return {
    ...(id ? { id } : {}),
    name: formData.get('name') ?? '',
    cashflow: formData.get('cashflow') ?? '',
    icon: formData.get('icon') ?? '',
    hue: formData.get('hue') ?? '',
  }
}

/** Accounts and categories are read by every page, so every page is stale now. */
function revalidateSettings() {
  revalidatePath('/', 'layout')
}
