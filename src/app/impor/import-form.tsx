'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useOffline } from 'next/offline'
import { BUTTON_PRIMARY } from '@/components/field-base'
import { formatIdr } from '@/lib/money'
import { importStatement, type ImportReport } from './actions'
import { waitPhase, withDeadline, type WaitPhase } from './wait'

/**
 * The upload form.
 *
 * Drag and drop is an enhancement layered over a real file input rather than a
 * replacement for one, so the control stays reachable by keyboard and legible to
 * a screen reader. The result panel is deliberately detailed: this upload is
 * also the accuracy check on manual bookkeeping, so what it found matters as
 * much as whether it worked.
 *
 * The wait itself gets an honest ending. `experimental.useOffline` holds a
 * failed request pending and retries it without a deadline of its own, which
 * looks identical to a slow server from a form that only ever renders
 * `pending`. Past ninety seconds this stops waiting and says so, and the
 * status line beneath the button explains what a still-changing label cannot.
 */

/** After this, the deadline below wins and the form stops waiting on its own. */
const DEADLINE_MS = 90_000

const WAIT_MESSAGE: Record<Exclude<WaitPhase, 'checking'>, string> = {
  slow: 'Masih berjalan, biasanya selesai di bawah sepuluh detik.',
  stalled:
    'Lebih lama dari biasanya. Kalau halaman ini dimuat ulang, impor yang sudah tersimpan tidak akan ganda.',
  offline: 'Koneksi terputus. Berkas dikirim ulang begitu jaringan kembali, jangan tutup halaman ini.',
}

function Submit({ hasFile }: { hasFile: boolean }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending || !hasFile}
      aria-busy={pending}
      className={BUTTON_PRIMARY}
    >
      {pending ? 'Memeriksa dan mencocokkan' : 'Impor'}
    </button>
  )
}

/** The extra line under the button, once the wait has gone on long enough to say more. */
function WaitStatus() {
  const { pending } = useFormStatus()
  const offline = useOffline()
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!pending) return
    // Both timers land on a later turn of the event loop rather than during
    // this render, `setTimeout(…, 0)` included: a fresh submission has to
    // start the count at zero rather than carry over whatever a previous one
    // left behind, and the tick after it counts up from there.
    let elapsed = 0
    const reset = setTimeout(() => setElapsedMs(0), 0)
    const id = setInterval(() => {
      elapsed += 1_000
      setElapsedMs(elapsed)
    }, 1_000)
    return () => {
      clearTimeout(reset)
      clearInterval(id)
    }
  }, [pending])

  if (!pending) return null
  const phase = waitPhase(elapsedMs, offline)
  if (phase === 'checking') return null

  return (
    <p role="status" aria-live="polite" className="text-subhead text-ink-muted">
      {WAIT_MESSAGE[phase]}
    </p>
  )
}

/**
 * `initialReport` exists for the fixture harness: a static page has no way
 * to submit a form and wait for a reply, so this is how one shows what a
 * finished report looks like. The real page never passes it.
 */
export function ImportForm({ initialReport = null }: { initialReport?: ImportReport | null } = {}) {
  const [report, action] = useActionState<ImportReport | null, FormData>(
    (previous, formData) =>
      withDeadline(importStatement(previous, formData), DEADLINE_MS, () => ({
        ok: false,
        message: 'Server belum menjawab setelah 90 detik.',
        detail:
          'Buka Tinjau untuk memeriksa apakah transaksinya sudah masuk. Mengunggah berkas yang sama lagi aman, tidak akan digandakan.',
      })),
    initialReport,
  )
  const [filename, setFilename] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files[0]
    if (!dropped || !inputRef.current) return

    // Assigning a DataTransfer list is the only way to put a dropped file into a
    // real input, which is what keeps the form a plain form.
    const transfer = new DataTransfer()
    transfer.items.add(dropped)
    inputRef.current.files = transfer.files
    setFilename(dropped.name)
  }

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border border-dashed p-8 text-center transition-colors duration-150 ${
            dragging ? 'border-accent bg-accent-wash' : 'border-line-strong bg-surface'
          }`}
        >
          <label
            htmlFor="statement"
            className="cursor-pointer text-subhead font-medium text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            Pilih berkas e-Statement
          </label>
          <input
            ref={inputRef}
            id="statement"
            name="statement"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            onChange={(event) => setFilename(event.target.files?.[0]?.name ?? null)}
            className="sr-only"
          />
          <p className="mt-2 text-subhead text-ink-muted">
            atau seret berkasnya ke sini. Format .xlsx dari Livin&apos;, maksimal 10 MB.
          </p>
          {filename ? (
            <p className="mt-3 inline-block rounded-sm border border-line bg-sunken px-3 py-1.5 tnum font-mono text-footnote text-ink">
              {filename}
            </p>
          ) : null}
        </div>

        <Submit hasFile={filename !== null} />
        <WaitStatus />
      </form>

      {report ? <Report report={report} /> : null}
    </div>
  )
}

function Report({ report }: { report: ImportReport }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`border p-4 ${
        report.ok ? 'border-under/40 bg-under-wash' : 'border-over/40 bg-over-wash'
      }`}
    >
      <p className="flex items-start gap-2 text-subhead font-medium text-ink">
        <span aria-hidden="true" className={report.ok ? 'text-under' : 'text-over'}>
          {report.ok ? '●' : '▲'}
        </span>
        <span>
          {report.filename ? (
            <span className="font-mono text-footnote text-ink-muted">{report.filename}</span>
          ) : null}
          {report.filename ? <br /> : null}
          {report.message}
        </span>
      </p>

      {report.detail ? <p className="mt-2 text-subhead text-ink-muted">{report.detail}</p> : null}

      {/*
        Both of the things that go wrong here are fixed on the same screen, and
        until that screen existed the message could only describe it. A detail
        that names a place a reader cannot get to is a dead end.
      */}
      {report.needsSettings === 'akun' || report.walletUnmatched ? (
        <p className="mt-2 text-subhead">
          <a href="/pengaturan#akun" className="text-accent underline underline-offset-2">
            {report.needsSettings === 'akun'
              ? 'Pasang kunci impor di Pengaturan'
              : 'Isi nomor e-wallet di Pengaturan'}
          </a>
        </p>
      ) : null}

      {report.ok && report.inserted !== undefined ? (
        <dl className="mt-3 grid gap-3 border-t border-line pt-3 text-subhead sm:grid-cols-2 lg:grid-cols-4">
          <Pair label="Periode" value={`${report.period?.start} sampai ${report.period?.end}`} />
          <Pair label="Masuk" value={`${report.inserted} transaksi`} />
          <Pair
            label="Sudah ada"
            value={`${report.duplicates} dilewati`}
            hint={report.duplicates ? 'Impor ulang memang tidak menggandakan.' : undefined}
          />
          <Pair
            label="Perlu ditinjau"
            value={`${report.needsReview}`}
            hint={report.needsReview ? 'Kategorinya belum pasti.' : undefined}
          />
          <Pair label="Saldo awal" value={report.openingBalance ?? formatIdr(0n)} mono />
          <Pair label="Saldo akhir" value={report.closingBalance ?? formatIdr(0n)} mono />
        </dl>
      ) : null}

      {report.duplicatesSuspected ? (
        <p className="mt-3 border-t border-line pt-3 text-subhead text-ink">
          <span aria-hidden="true" className="mr-1.5 text-warn">
            ◆
          </span>
          {report.duplicatesSuspected} catatan manual kemungkinan sama dengan baris yang baru masuk.
          <span className="mt-0.5 block text-ink-muted">
            Keduanya masih terhitung sampai kamu memutuskan.{' '}
            <a href="/tinjau#kemungkinan-ganda" className="text-accent underline underline-offset-2">
              Cocokkan di halaman Tinjau
            </a>
            .
          </span>
        </p>
      ) : null}

      {report.issues && report.issues.length > 0 ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-subhead font-medium text-ink">
            Baris yang tidak cocok ({report.issues.length})
          </p>
          <ul className="mt-2 space-y-1 text-subhead text-ink-muted">
            {report.issues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.sheetRow ?? issue.kind}-${index}`}>
                {issue.sheetRow === undefined ? (
                  <>Total {issue.kind}</>
                ) : (
                  <>
                    Baris <span className="tnum font-mono text-ink">{issue.sheetRow}</span>
                  </>
                )}
                : seharusnya <span className="tnum font-mono">{issue.expected}</span>, terbaca{' '}
                <span className="tnum font-mono">{issue.actual}</span>
              </li>
            ))}
          </ul>
          {report.issues.length > 8 ? (
            <p className="mt-1 text-footnote text-ink-faint">
              dan {report.issues.length - 8} baris lain.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Pair({
  label,
  value,
  hint,
  mono = false,
}: {
  label: string
  value: string
  hint?: string
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-footnote text-ink-faint">{label}</dt>
      <dd className={`mt-0.5 text-ink ${mono ? 'tnum font-mono' : ''}`}>
        {value}
        {/* Nested inside <dd> rather than a sibling <p>: a <dl>'s own children
            (once <div>-wrapped) may only be dt/dd, and axe's definition-list
            check enforces it. This report is the first e2e fixture to render
            far enough to exercise that check. */}
        {hint ? <span className="mt-0.5 block text-footnote font-normal text-ink-faint">{hint}</span> : null}
      </dd>
    </div>
  )
}
