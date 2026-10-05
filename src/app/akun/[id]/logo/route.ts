import { createClient, getUser } from '@/lib/supabase/server'

/**
 * One account's icon, as the WebP the settings form stored.
 *
 * Read with the signed-in member's own client, so the accounts row-level
 * policy decides who sees which icon; another household's id answers exactly
 * like a missing one. The bytes were re-encoded on the way in
 * (src/lib/brand-logo.ts), and `nosniff` plus a `default-src 'none'` policy
 * keep the browser from treating them as anything but a picture.
 *
 * The URL carries the icon's hash (`?v=`), so it can be cached for a year:
 * a new icon is a new URL. `private`, because it sits behind a session.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const NOT_FOUND = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NOT_FOUND()
  if (!(await getUser())) return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } })

  const supabase = await createClient()
  const { data } = await supabase.from('accounts').select('logo').eq('id', id).maybeSingle()
  const logo = (data?.logo as string | null | undefined) ?? null
  if (!logo) return NOT_FOUND()

  return new Response(Buffer.from(logo, 'base64'), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
}
