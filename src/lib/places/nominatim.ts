import { cacheLife } from 'next/cache'
import { z } from 'zod'

/**
 * Looking a merchant up on OpenStreetMap, from the server.
 *
 * From the server so the browser's CSP stays closed to one more host, and so
 * the usage policy can be kept in one place: an identifying User-Agent, one
 * request a second, and results cached rather than asked for again
 * (https://operations.osmfoundation.org/policies/nominatim/). What leaves is
 * the name typed into the search box. No amount, no date, no household.
 *
 * The bias box covers Jabodetabek and Bandung, where the household spends.
 * It is a preference, not a fence: a search for a place in Bali still answers.
 */

export interface Candidate {
  label: string
  address: string
  lat: number
  lng: number
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
/** west, north, east, south: Serang to Bandung, Bogor to the Java Sea. */
const BIAS = '106.0,-5.9,107.8,-7.1'
const LIMIT = 6
const TIMEOUT_MS = 8000

export function searchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    countrycodes: 'id',
    viewbox: BIAS,
    bounded: '0',
    limit: String(LIMIT),
    'accept-language': 'id',
  })
  return `${ENDPOINT}?${params}`
}

const coordinate = z.string().regex(/^-?\d{1,3}(\.\d+)?$/).transform(Number)

const answer = z.array(
  z.object({
    lat: coordinate.pipe(z.number().min(-90).max(90)),
    lon: coordinate.pipe(z.number().min(-180).max(180)),
    name: z.string().optional(),
    display_name: z.string(),
  }),
)

/** What Nominatim sent, reduced to what the form shows; anything malformed is dropped whole. */
export function readCandidates(body: unknown): Candidate[] {
  const parsed = answer.safeParse(body)
  if (!parsed.success) return []
  return parsed.data.slice(0, LIMIT).map((place) => ({
    label: (place.name || place.display_name.split(',')[0]).trim().slice(0, 120),
    address: place.display_name.trim().slice(0, 300),
    lat: place.lat,
    lng: place.lon,
  }))
}

/*
  One request a second per server instance. A deployment with several warm
  instances could exceed it in theory; a household of two typing into a search
  box will not, and the cache below means a repeated name never asks at all.
*/
let nextSlot = 0

async function takeTurn(): Promise<void> {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + 1000
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now))
}

function userAgent(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL
  return site ? `FiFoFun/1.0 (+${site})` : 'FiFoFun/1.0'
}

/**
 * Candidates for a name, or null when OpenStreetMap could not be asked.
 *
 * Null rather than an empty list so the form can tell "nothing by that name"
 * from "try again later". Only real answers are cached; `lookUp` throws on a
 * failure so the cache never keeps one.
 */
export async function searchPlaces(query: string): Promise<Candidate[] | null> {
  try {
    return await lookUp(query.trim().toLowerCase())
  } catch (error) {
    console.error('[peta] pencarian OpenStreetMap gagal', error)
    return null
  }
}

async function lookUp(query: string): Promise<Candidate[]> {
  'use cache'
  cacheLife('weeks')

  await takeTurn()
  const response = await fetch(searchUrl(query), {
    headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`Nominatim ${response.status}`)
  return readCandidates(await response.json())
}
