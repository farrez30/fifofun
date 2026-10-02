'use client'

import { useState } from 'react'
import { BUTTON_TINTED } from '@/components/field-base'

/**
 * Hands the PDF to the phone's own share sheet when there is one, so it can go
 * straight into a chat; elsewhere it downloads like any file.
 *
 * The file is made on the server from the same figures as the page
 * (`pdf/route.ts`), so what is sent cannot differ from what was shown.
 */
export function SharePdf({ end }: { end: string }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const href = `/ringkasan/pdf?sampai=${end}`
  const name = `ringkasan-3-bulan-${end}.pdf`

  const share = async () => {
    setBusy(true)
    setProblem(null)
    try {
      const response = await fetch(href)
      if (!response.ok) throw new Error(String(response.status))
      const file = new File([await response.blob()], name, { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Ringkasan 3 bulan' })
      } else {
        const url = URL.createObjectURL(file)
        const link = Object.assign(document.createElement('a'), { href: url, download: name })
        link.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      // Closing the share sheet is a choice, not a failure.
      if ((error as Error).name !== 'AbortError') setProblem('PDF-nya gagal dibuat. Coba lagi sebentar lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <button type="button" onClick={share} aria-busy={busy || undefined} disabled={busy} className={BUTTON_TINTED}>
        Bagikan sebagai PDF
      </button>
      {problem ? (
        <p role="alert" className="text-subhead text-over">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
