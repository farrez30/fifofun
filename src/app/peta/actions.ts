'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'
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
})

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
  const parsed = placeSchema.safeParse(read(formData, ['merchantKey', 'label', 'address', 'lat', 'lng', 'source']))
  if (!parsed.success) return fail('Lokasinya belum bisa disimpan.', parsed.error.issues[0]?.message)

  const ctx = await context()
  if (!ctx) return fail(SESSION_EXPIRED)

  const values = parsed.data
  const { error } = await ctx.supabase
    .from('merchant_locations')
    .upsert(
      {
        household_id: ctx.householdId,
        merchant_key: values.merchantKey,
        label: values.label,
        address: values.address,
        lat: values.lat,
        lng: values.lng,
        source: values.source,
      },
      { onConflict: 'household_id,merchant_key' },
    )
    .select('id')
  if (error) return writeFailed('peta', 'Lokasinya gagal disimpan.', error)

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

  const { error } = await ctx.supabase
    .from('merchant_locations')
    .upsert(
      {
        household_id: ctx.householdId,
        merchant_key: parsed.data.merchantKey,
        label: parsed.data.label,
        address: null,
        lat: null,
        lng: null,
        source: 'manual',
      },
      { onConflict: 'household_id,merchant_key' },
    )
    .select('id')
  if (error) return writeFailed('peta', 'Tandanya gagal disimpan.', error)

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

  const { data, error } = await ctx.supabase
    .from('merchant_locations')
    .delete()
    .eq('id', parsed.data)
    .eq('household_id', ctx.householdId)
    .select('id')
  if (error) return writeFailed('peta', 'Lokasinya gagal dihapus.', error)
  if (!data?.length) return fail('Lokasinya sudah tidak ada.', 'Mungkin sudah dihapus dari perangkat lain.')

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
