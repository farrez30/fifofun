/**
 * What the upload button says while the upload is pending.
 *
 * Only the sentence. How long the form is willing to wait lives with the
 * request itself, as the `AbortSignal.timeout` in `upload.ts`, which unlike a
 * race against a Server Action actually stops the request.
 */

export type WaitPhase = 'checking' | 'slow' | 'stalled'

const SLOW_MS = 8_000
const STALLED_MS = 45_000

/** Which sentence to show, from how long the upload has been pending. */
export function waitPhase(elapsedMs: number): WaitPhase {
  if (elapsedMs >= STALLED_MS) return 'stalled'
  if (elapsedMs >= SLOW_MS) return 'slow'
  return 'checking'
}
