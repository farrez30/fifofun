import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { formatJakarta } from '@/lib/datetime'
import { getHousehold } from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'
import { loadSummary } from '../data'
import { SummaryPdf } from './summary-pdf'

/**
 * The summary as a PDF, rendered here rather than printed by the browser, so
 * it comes out the same A4 page from any phone.
 *
 * Signed in only, and never cached by anything in between: it is the
 * household's money on one sheet.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getUser()
  if (!user) return new Response('Sesi berakhir. Masuk lagi.', { status: 401 })
  const household = await getHousehold()
  if (!household) return new Response('Rumah tangga tidak ditemukan.', { status: 404 })

  const end = new URL(request.url).searchParams.get('sampai') ?? undefined
  const data = await loadSummary(household.id, end)
  const buffer = await renderToBuffer(
    createElement(SummaryPdf, { data, printedAt: formatJakarta(new Date(), 'date') }) as never,
  )

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ringkasan-3-bulan-${data.end}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
