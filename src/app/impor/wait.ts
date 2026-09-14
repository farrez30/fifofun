/**
 * What the upload button says while a Server Action is pending, and how long
 * it is allowed to keep saying it.
 *
 * `experimental.useOffline` (next.config.ts) holds a Server Action whose
 * fetch rejects and replays it once the connection returns, with no cap of
 * its own — the polling loop "never gives up" per Next's own docs. That is
 * the right behaviour for a genuine drop in connectivity and the wrong one
 * for a function the platform killed mid-response, which looks identical
 * from here: `pending` stays true, the label never changes again. This is
 * the client-side deadline that stops the wait instead of trusting the
 * platform to say so.
 */

export type WaitPhase = 'checking' | 'slow' | 'stalled' | 'offline'

const SLOW_MS = 8_000
const STALLED_MS = 45_000

/** Which sentence to show, from how long the action has been pending. */
export function waitPhase(elapsedMs: number, offline: boolean): WaitPhase {
  if (offline) return 'offline'
  if (elapsedMs >= STALLED_MS) return 'stalled'
  if (elapsedMs >= SLOW_MS) return 'slow'
  return 'checking'
}

/**
 * Races a promise against a deadline, without cancelling the loser.
 *
 * The Server Action keeps running (and `useOffline` may keep replaying it)
 * after the deadline fires; there is no `AbortSignal` reaching a Server
 * Action from here. What this buys is only the UI's own patience: past the
 * deadline the form stops waiting and tells the truth about what it does not
 * know, rather than staying silent because the promise it is watching never
 * settles.
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(onTimeout()), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
