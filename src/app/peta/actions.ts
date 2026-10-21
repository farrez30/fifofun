'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'
import { excludedSet, setClause, sql } from '@/db/query'
import { SESSION_EXPIRED, context, fail, writeFailed, type ActionResult } from '@/lib/actions'
import { searchPlaces, type Candidate } from '@/lib/places/nominatim'
import { placesTag } from '@/lib/queries/tags'

/**
 * Placing a merchant, and taking a place back.
 *
 * One row per merchant, keyed the way the map groups payments, so saving is an
 * upsert: moving a pin and placing it the first time are the same write. A
 * merchant can also be marked as having no place at all (a shop that only
 * sells online but takes QRIS), which is the same row with no coordinates.
 */

const merchantKey = z.string().trim().toLowerCase().min(3).max(120)
const label = z.string().trim().min(1, 'Namanya belum diisi.').max(120, 'Namanya maksimal 120 huruf.')

/** A date input's value, or nothing. */
const day = z
  .string()
  .trim()
  .regex(/^(\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))?$/, 'Tanggalnya belum terbaca.')
  .transform((value) => value || null)

/** A coordinate as a form submits it: digits with a dot, bounded. */
function degrees(limit: number, name: string) {
  return z
    .string()
    .trim()
    .regex(/^-?\d{1,3}(\.\d{1,10})?$/, `${name} belum bisa dibaca.`)
    .transform(Number)
    .pipe(z.number().min(-limit).max(limit, `${name} di luar jangkauan.`))
}

const placeSchema = z.object({
  merchantKey,
  label,
  address: z
    .string()
    .trim()
    .max(300)
    .transform((value) => value || null),
  lat: degrees(90, 'Lintang'),
  lng: degrees(180, 'Bujur'),
  source: z.enum(['manual', 'osm']),
  /** The stored point being moved; empty when placing a merchant afresh. */
  id: z.uuid().or(z.literal('')).transform((value) => value || null),
  validFrom: day,
  validTo: day,
}).refine((values) => !values.validFrom || !values.validTo || values.validFrom <= values.validTo, {
  message: 'Tanggal mulai harus sebelum tanggal selesai.',
  path: ['validTo'],
})

/** Two periods share a day; null ends are open. */
function overlaps(a: { from: string | null; to: string | null }, b: { from: string | null; to: string | null }) {
  return (!a.from || !b.to || a.from <= b.to) && (!b.from || !a.to || b.from <= a.to)
}

const placelessSchema = z.object({ merchantKey, label })

function read(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, String(formData.get(key) ?? '')]))
}

function revalidatePlaces(householdId: string) {
  updateTag(placesTag(householdId))
  revalidatePath('/peta')
}

export async function saveMerchantLocation(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = placeSchema.safeParse(
    read(formData, ['merchantKey', 'label', 'address', 'lat', 'lng', 'source', 'id', 'validFrom', 'validTo']),
  )
  if (!parsed.success) return fail('Lokasinya belum bisa disimpan.', parsed.error.issues[0]?.message)

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const values = parsed.data
  /*
    The other points this merchant already has. A date can belong to one
    point only, which a constraint could say too, but only with an extension
    and a message in Latin; here it is a sentence.
  */
  type Other = { id: string; label: string; valid_from: string | null; valid_to: string | null }
  let others: Other[]
  try {
    others = await ctx.db.rows<Other>(sql`
      SELECT id, label, valid_from, valid_to FROM public.merchant_locations
      WHERE household_id = ${ctx.householdId} AND merchant_key = ${values.merchantKey}`)
  } catch (e) {
    return writeFailed('peta', 'Lokasinya gagal disimpan.', e)
  }

  const period = { from: values.validFrom, to: values.validTo }
  const clash = others.find(
    (row) =>
      row.id !== values.id &&
      // An open-ended point is the one being replaced when no id was given.
      !(values.id === null && !values.validFrom && !row.valid_from) &&
      overlaps(period, { from: row.valid_from, to: row.valid_to }),
  )
  if (clash) {
    return fail(
      'Periodenya bertabrakan dengan titik lain untuk pedagang ini.',
      `${clash.label} sudah berlaku untuk sebagian tanggal itu. Ubah tanggalnya, atau pindahkan titik itu.`,
    )
  }

  const row = {
    household_id: ctx.householdId,
    merchant_key: values.merchantKey,
    label: values.label,
    address: values.address,
    lat: values.lat,
    lng: values.lng,
    source: values.source,
    valid_from: values.validFrom,
    valid_to: values.validTo,
  }
  try {
    if (values.id) {
      await ctx.db.rows(sql`
        UPDATE public.merchant_locations SET ${setClause(row)}
        WHERE id = ${values.id} AND household_id = ${ctx.householdId}
        RETURNING id`)
    } else {
      await ctx.db.rows(sql`
        INSERT INTO public.merchant_locations
          (household_id, merchant_key, label, address, lat, lng, source, valid_from, valid_to)
        VALUES (${row.household_id}, ${row.merchant_key}, ${row.label}, ${row.address}, ${row.lat},
          ${row.lng}, ${row.source}, ${row.valid_from}, ${row.valid_to})
        ON CONFLICT (household_id, merchant_key, valid_from) DO UPDATE SET ${excludedSet([
          'label',
          'address',
          'lat',
          'lng',
          'source',
          'valid_to',
        ])}
        RETURNING id`)
    }
  } catch (e) {
    return writeFailed('peta', 'Lokasinya gagal disimpan.', e)
  }

  revalidatePlaces(ctx.householdId)
  return { ok: true, message: `${values.label} ditaruh di peta.` }
}

export async function markPlaceless(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = placelessSchema.safeParse(read(formData, ['merchantKey', 'label']))
  if (!parsed.success) return fail('Pedagangnya tidak dikenali.', parsed.error.issues[0]?.message)

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  // valid_to is not in the write, so a placeless mark keeps whatever end date the row had.
  try {
    await ctx.db.rows(sql`
      INSERT INTO public.merchant_locations (household_id, merchant_key, label, address, lat, lng, source)
      VALUES (${ctx.householdId}, ${parsed.data.merchantKey}, ${parsed.data.label}, NULL, NULL, NULL, 'manual')
      ON CONFLICT (household_id, merchant_key, valid_from) DO UPDATE SET ${excludedSet([
        'label',
        'address',
        'lat',
        'lng',
        'source',
      ])}
      RETURNING id`)
  } catch (e) {
    return writeFailed('peta', 'Tandanya gagal disimpan.', e)
  }

  revalidatePlaces(ctx.householdId)
  return {
    ok: true,
    message: `${parsed.data.label} ditandai tanpa tempat.`,
    detail: 'Belanjanya dihitung di porsi yang tidak bisa dipetakan.',
  }
}

/** Forgets a place, so the merchant goes back to the list waiting for one. */
export async function deleteMerchantLocation(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(String(formData.get('id') ?? ''))
  if (!parsed.success) return fail('Lokasinya tidak dikenali.')

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  let data: { id: string }[]
  try {
    data = await ctx.db.rows<{ id: string }>(sql`
      DELETE FROM public.merchant_locations
      WHERE id = ${parsed.data} AND household_id = ${ctx.householdId}
      RETURNING id`)
  } catch (e) {
    return writeFailed('peta', 'Lokasinya gagal dihapus.', e)
  }
  if (!data.length) return fail('Lokasinya sudah tidak ada.', 'Mungkin sudah dihapus dari perangkat lain.')

  revalidatePlaces(ctx.householdId)
  return { ok: true, message: 'Lokasinya dihapus.', detail: 'Pedagangnya kembali ke daftar belum berlokasi.' }
}

export interface SearchResult extends ActionResult {
  candidates: Candidate[]
}

const queryField = z.string().trim().min(2, 'Ketik minimal dua huruf.').max(100, 'Cukup 100 huruf.')

/** Places on OpenStreetMap matching a name. Signed in only, so the endpoint cannot be borrowed. */
export async function searchPlace(_previous: SearchResult | null, formData: FormData): Promise<SearchResult> {
  const parsed = queryField.safeParse(String(formData.get('q') ?? ''))
  if (!parsed.success) return { ...fail('Pencariannya belum bisa dijalankan.', parsed.error.issues[0]?.message), candidates: [] }

  const ctx = await context()
  if (!ctx) return { ...fail(SESSION_EXPIRED), candidates: [] }

  const candidates = await searchPlaces(parsed.data)
  if (candidates === null) {
    return {
      ...fail('OpenStreetMap sedang tidak menjawab.', 'Coba lagi sebentar lagi, atau klik langsung di peta.'),
      candidates: [],
    }
  }
  return {
    ok: true,
    message: candidates.length ? `${candidates.length} tempat ditemukan.` : 'Tidak ada tempat dengan nama itu.',
    detail: candidates.length ? undefined : 'Coba nama yang lebih pendek, tambahkan nama daerah, atau klik di peta.',
    candidates,
  }
}
