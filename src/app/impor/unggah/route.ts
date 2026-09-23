import { NextResponse } from 'next/server'
import { importStatement, MAX_UPLOAD_BYTES, type ImportReport } from '../import-statement'

/**
 * The statement upload, as a plain POST rather than a Server Action.
 *
 * `import-statement.ts` says why it left the action. What a route gives up in
 * exchange is the two checks Next runs on every action for free, so both are
 * here:
 *
 *   1. Same origin. The session travels in a cookie, and a cookie rides along
 *      on a cross-site form post; without this, any page the reader has open
 *      could import a file into their ledger.
 *   2. A size cap read from Content-Length, before `formData()` buffers the
 *      body. The import checks the file itself too, but only once the whole
 *      request is already in memory.
 *
 * The session is checked where it always was, inside `importStatement`.
 */

/*
 * The platform's own cut-off. The client gives up at ninety seconds and says
 * so; past this line the platform cuts the function off mid-response, which
 * the client sees as a 504 rather than as silence.
 */
export const maxDuration = 60

/** Room for the multipart boundary and headers around the file itself. */
const MULTIPART_OVERHEAD = 64 * 1024

function report(body: ImportReport, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Whether the request came from a page on this host.
 *
 * Compared against the forwarded host where there is one, the same header
 * Next checks a Server Action against, because behind Vercel's edge the
 * `Host` the function sees is not always the one the browser used.
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!sameOrigin(request)) {
    return report({ ok: false, message: 'Permintaan ini ditolak.' }, 403)
  }

  const length = Number(request.headers.get('content-length'))
  if (!Number.isFinite(length) || length <= 0) {
    return report({ ok: false, message: 'Pilih satu berkas e-Statement lebih dulu.' }, 411)
  }
  if (length > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD) {
    return report(
      {
        ok: false,
        message: 'Berkasnya terlalu besar.',
        detail: `Batasnya ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. E-Statement Mandiri biasanya di bawah 100 KB, jadi kemungkinan besar ini bukan berkas yang dimaksud.`,
      },
      413,
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return report({ ok: false, message: 'Pilih satu berkas e-Statement lebih dulu.' }, 400)
  }

  return report(await importStatement(formData))
}
