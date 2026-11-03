/**
 * Stops this page inheriting `src/app/loading.tsx`, which paints the signed-in
 * app's sidebar and tab bar. Every response here is dynamic (the CSP nonce),
 * so that fallback is streamed first even on a hard load: a stranger saw the
 * app's navigation flash, with live links to pages they cannot open.
 */
export default function Loading() {
  return <div aria-busy="true" className="min-h-dvh" />
}
