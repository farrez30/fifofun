/**
 * The frame for the legal pages.
 *
 * They sit outside the app shell on purpose: someone should be able to read what
 * the app does with their data before deciding to sign up, not after. The
 * header lives in `legal-frame.tsx`, since it needs the query string.
 */
export default function LegalLayout({ children }: LayoutProps<'/legal'>) {
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-6 pb-10 pt-[calc(2.5rem+var(--spacing-safe-t))]">
      {children}
    </div>
  )
}
