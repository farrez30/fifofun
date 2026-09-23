import type { ImportReport } from './import-statement'

/**
 * Sends a statement to `unggah/route.ts`, once, and turns every way that can
 * go wrong into a report the form can show.
 *
 * Once is the point. This used to be a Server Action, and
 * `experimental.useOffline` replays a rejected action forever with the same
 * body. The upload that kept rejecting was a file that changed on disk after
 * it was picked (still open in Excel, a download still finishing, a sync
 * client touching it), which fails identically every time, so the replay
 * never ended and the form flickered "Koneksi terputus" until the deadline.
 *
 * Two things stop that here. The file is copied into memory before the
 * request starts, so what goes over the wire no longer depends on the disk.
 * And the fetch is plain: a rejection is reported, never retried behind the
 * reader's back.
 */

export const UPLOAD_ENDPOINT = '/impor/unggah'

/** Past this the form stops waiting and says so; the server's own cut-off is 60s. */
export const DEADLINE_MS = 90_000

/** Uploading the same file again is safe, and each failure below leans on that. */
const RETRY_IS_SAFE =
  'Mengunggah berkas yang sama lagi aman, transaksi yang sudah masuk tidak akan digandakan.'

export const UPLOAD_FAILURES = {
  noFile: { ok: false, message: 'Pilih satu berkas e-Statement lebih dulu.' },
  unreadable: {
    ok: false,
    message: 'Berkasnya belum bisa dibaca dari perangkatmu.',
    detail:
      'Biasanya karena berkasnya masih terbuka di Excel, masih diunduh, atau sedang disinkronkan. Tutup atau tunggu sampai selesai, lalu pilih berkasnya lagi.',
  },
  timeout: {
    ok: false,
    message: 'Server belum menjawab setelah 90 detik.',
    detail: `Buka Tinjau untuk memeriksa apakah transaksinya sudah masuk. ${RETRY_IS_SAFE}`,
  },
  network: {
    ok: false,
    message: 'Koneksi ke server terputus sebelum ada jawaban.',
    detail: `Belum bisa dipastikan apakah impornya sempat berjalan. Periksa koneksimu, lalu unggah lagi. ${RETRY_IS_SAFE}`,
  },
  tooLarge: {
    ok: false,
    message: 'Berkasnya terlalu besar.',
    detail:
      'Batasnya 3 MB. E-Statement Mandiri biasanya di bawah 100 KB, jadi kemungkinan besar ini bukan berkas yang dimaksud.',
  },
  serverTimeout: {
    ok: false,
    message: 'Server berhenti sebelum impornya selesai.',
    detail: `Buka Tinjau untuk memeriksa apakah transaksinya sudah masuk. ${RETRY_IS_SAFE}`,
  },
  unexpected: {
    ok: false,
    message: 'Server menjawab dengan sesuatu yang tidak dikenali.',
    detail: `Coba lagi sebentar lagi. ${RETRY_IS_SAFE}`,
  },
} satisfies Record<string, ImportReport>

function isReport(value: unknown): value is ImportReport {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ImportReport).ok === 'boolean' &&
    typeof (value as ImportReport).message === 'string'
  )
}

export async function uploadStatement(
  file: FormDataEntryValue | null,
  { timeoutMs = DEADLINE_MS, password }: { timeoutMs?: number; password?: FormDataEntryValue | null } = {},
): Promise<ImportReport> {
  if (!(file instanceof File) || file.size === 0) return UPLOAD_FAILURES.noFile

  let copy: File
  try {
    copy = new File([await file.arrayBuffer()], file.name, { type: file.type })
  } catch {
    return UPLOAD_FAILURES.unreadable
  }

  const body = new FormData()
  body.append('statement', copy)
  // Only for a file the server already said is locked. Sent over the same
  // HTTPS request as the file and used for nothing but opening it.
  if (typeof password === 'string' && password.length > 0) body.append('password', password)

  let response: Response
  try {
    response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    return error instanceof DOMException && error.name === 'TimeoutError'
      ? UPLOAD_FAILURES.timeout
      : UPLOAD_FAILURES.network
  }

  // The route answers every case it knows about as JSON, errors included. What
  // is left is the platform answering on its behalf, as an HTML page.
  const answer: unknown = await response.json().catch(() => null)
  if (isReport(answer)) return answer
  if (response.status === 413) return UPLOAD_FAILURES.tooLarge
  if (response.status === 504) return UPLOAD_FAILURES.serverTimeout
  return UPLOAD_FAILURES.unexpected
}
