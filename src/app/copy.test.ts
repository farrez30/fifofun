import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A guard for the five rules in `docs/copywriting.md` a pattern can actually
 * judge.
 *
 * The other seven — a repeated sentence frame collapsing into a table, the
 * four-layer order, two compared numbers shown together — are calls about
 * what a paragraph is *for*, and no regex replaces reading it. These five are
 * calls about what a character or a token *is*, which a script sees as
 * reliably as a person: an em dash, an emoji, a sapaan the rest of the app
 * never uses, a `SESSION_EXPIRED` sentence retyped instead of imported, and a
 * raw `error.message` reaching a reader who can do nothing with a Postgres
 * constraint name. A test rather than an eslint rule for the same reason
 * `type-roles.test.ts` is one: cheaper to walk `src/app` and
 * `src/components` directly than to teach a linter five unrelated shapes.
 *
 * Scoped to those two directories, not all of `src`: that is where `fail()`,
 * `ActionResult` and rendered JSX text live. `src/lib` holds parsers whose
 * own error strings mostly never reach a reader (`xlsx`, `mandiri-xlsx`'s
 * `reconcile()`), and flagging a message nobody sees would be noise, not a
 * fix.
 *
 * One named exception: `impor/actions.ts` passes a caught error's own
 * `.message` into the reader-facing detail when a .xlsx fails to parse. That
 * message is written in Indonesian at the throw site (`mandiri-xlsx.ts`'s
 * `StatementParseError`), so passing it through is the point, not a leak —
 * the leak this test polices is a *server* error reaching the same field.
 */

const SCOPE = ['src/app', 'src/components']
const ALLOWED_RAW_ERROR_MESSAGE = new Set(['src/app/impor/actions.ts'])

const EM_DASH = /—/
const EMOJI = /\p{Extended_Pictographic}/u
const WRONG_SAPAAN = /\b(Anda|Silakan|Mohon|Oops)\b/
const RAW_ERROR_MESSAGE = /\b[a-zA-Z]*[Ee]rror\??\.message\b/
const SESSION_EXPIRED_LITERAL = /Sesi kamu sudah berakhir\. Masuk lagi lalu ulangi\./

/** Block comments, then line comments — never a `://` a link happens to carry. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*$/gm, '')
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts'))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name).replace(/\\/g, '/'))
}

describe('the app keeps to its own copywriting rules', () => {
  it('never lets an em dash, an emoji, the wrong sapaan, a retyped session message, or a raw server error reach a reader', async () => {
    const offenders: string[] = []

    for (const dir of SCOPE) {
      for (const file of await sourceFiles(dir)) {
        const lines = stripComments(await readFile(file, 'utf8')).split('\n')

        lines.forEach((line, index) => {
          const at = `${file}:${index + 1}`
          if (EM_DASH.test(line)) offenders.push(`${at} — em dash: ${line.trim()}`)
          if (EMOJI.test(line)) offenders.push(`${at} — emoji: ${line.trim()}`)
          if (WRONG_SAPAAN.test(line)) offenders.push(`${at} — bukan "kamu": ${line.trim()}`)
          if (SESSION_EXPIRED_LITERAL.test(line)) {
            offenders.push(`${at} — impor SESSION_EXPIRED, jangan ditulis ulang: ${line.trim()}`)
          }
          if (RAW_ERROR_MESSAGE.test(line) && !ALLOWED_RAW_ERROR_MESSAGE.has(file)) {
            offenders.push(`${at} — pesan server mentah, pakai writeFailed(): ${line.trim()}`)
          }
        })
      }
    }

    expect(offenders).toEqual([])
  })
})
