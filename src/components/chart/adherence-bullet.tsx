import type { Adherence, AdherenceGroup } from '@/lib/planning/adherence'
import { formatIdr, formatIdrCompact } from '@/lib/money'

/**
 * The framework's recommendation against what the household actually did.
 *
 * The allocation panel above this could say OJK puts cicilan at thirty percent
 * and had no way to say whether this household was at eight or at forty. A well
 * sourced number nobody is measured against is decoration.
 *
 * A bullet row rather than two bars, matching the budget panel, because the
 * recommendation is a line the reality either crosses or does not, and that is
 * the question. Two bars side by side leave the reader to do the comparison.
 *
 * Where several buckets draw on the same pot they arrive here already folded
 * together, and the row says so. That is the honest limit of a ledger filed by
 * cashflow: it knows what was spent and what was set aside, and it cannot know
 * which of the spending was optional.
 */

const ALARM = {
  over: { glyph: '▲', bar: 'bg-over', text: 'text-over' },
  short: { glyph: '▼', bar: 'bg-warn', text: 'text-warn' },
} as const

const QUIET = { glyph: null, bar: 'bg-accent', text: 'text-ink-faint' } as const

const BOUND_WORD = {
  min: 'batas bawah',
  max: 'batas atas',
  target: 'anjuran',
} as const

const BOUND_TAG = {
  min: 'minimal',
  max: 'maksimal',
  target: 'target',
} as const

function styleFor(group: AdherenceGroup) {
  return group.verdict === 'healthy' ? QUIET : ALARM[group.verdict]
}

/** `92%` from a fraction, or nothing at all when there was no income to divide by. */
function percent(share: number | null): string | null {
  return share === null ? null : `${Math.round(share * 100)}%`
}

interface Props {
  adherence: Adherence
  /**
   * The income actually observed in the ledger. When it differs from the one
   * the figures were computed against, the reader is told: a household typing
   * a hopeful salary into the simulator would otherwise be shown a flattering
   * verdict about spending that has not changed at all.
   */
  observedIncome: bigint
  caption: string
}

export function AdherenceBullet({ adherence, observedIncome, caption }: Props) {
  const { groups, income, failing, unassigned, framework } = adherence

  if (income <= 0n) {
    return (
      <figure className="border border-line bg-surface p-6">
        <figcaption className="text-sm font-medium text-ink">{caption}</figcaption>
        <p className="mt-2 text-sm text-ink-muted">
          Perbandingannya butuh penghasilan bulanan. Isi angkanya di atas, atau impor mutasi
          supaya terisi sendiri.
        </p>
      </figure>
    )
  }

  /*
    One scale shared by every row, so the bars are comparable between groups
    rather than each being normalised to itself. Income is the floor of it: a
    month that outspent what it earned has to be visibly past the whole of it,
    not merely at the end of a bar.
  */
  const ceiling = groups.reduce((max, group) => {
    const local = group.actual > group.recommended ? group.actual : group.recommended
    return local > max ? local : max
  }, income)

  const widthOf = (amount: bigint) =>
    ceiling <= 0n ? 0 : Number((amount * 10_000n) / ceiling) / 100

  const hypothetical = income !== observedIncome

  return (
    <figure className="border border-line bg-surface">
      <div className="border-b border-line p-4">
        <figcaption className="text-sm font-medium text-ink">{caption}</figcaption>
        <p className="mt-1 text-sm text-ink-muted">
          {failing.length === 0
            ? `Semua pos ada di dalam batas yang ${framework.name} sebutkan.`
            : `${failing.length} dari ${groups.length} pos ada di luar batasnya. Yang paling besar: ${failing[0].labels.join(' dan ')}, ${formatIdrCompact(failing[0].gap)} ${failing[0].verdict === 'short' ? 'kurang' : 'lebih'}.`}
        </p>
        {/* Ink on a wash rather than warn-coloured text. The amber reads at a
            glance and fails 4.5:1 against the surface, which axe caught on this
            paragraph and not on the single glyphs elsewhere. The wash is the
            pattern the planner already uses for exactly this. */}
        {hypothetical ? (
          <p className="mt-2 border border-warn/40 bg-warn-wash px-3 py-2 text-xs text-ink">
            <span aria-hidden="true" className="mr-1.5 text-warn">
              ▲
            </span>
            Dihitung terhadap penghasilan yang kamu ketik, bukan {formatIdrCompact(observedIncome)}{' '}
            yang tercatat. Pengeluarannya masih angka yang sebenarnya.
          </p>
        ) : null}
      </div>

      <ul className="divide-y divide-line">
        {groups.map((group) => {
          const style = styleFor(group)
          const share = percent(group.actualShare)
          return (
            <li key={group.keys.join('-')} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm text-ink">
                  {style.glyph ? (
                    <span aria-hidden="true" className={`mr-1.5 ${style.text}`}>
                      {style.glyph}
                    </span>
                  ) : null}
                  {group.labels.join(' + ')}
                  <span className="ml-2 rounded-xs border border-line px-1.5 py-0.5 text-[0.625rem] uppercase tracking-wide text-ink-muted">
                    {BOUND_TAG[group.bound]} {Math.round(group.share * 100)}%
                  </span>
                </span>
                <span className="tnum font-mono text-sm text-ink">
                  {formatIdr(group.actual)}
                  {share ? <span className="ml-2 text-ink-faint">{share}</span> : null}
                </span>
              </div>

              <div className="relative mt-2 h-2.5 bg-sunken">
                {/*
                  The part of the track the group is not supposed to end in: past
                  a ceiling, or short of a floor.

                  The budget panel uses this same bullet row, and there a bar
                  past its marker always means a breach. Here it depends, because
                  passing a floor is the household doing well. Two charts on one
                  page cannot share an idiom and disagree about what it means, so
                  the track says which side is the wrong one rather than leaving
                  it to be inferred from a tag. A step in grey rather than a wash
                  of red, because a zone being the wrong side is not by itself a
                  finding: the bar has to be sitting in it.
                */}
                <div
                  data-offside={group.bound === 'min' ? 'below' : 'above'}
                  aria-hidden="true"
                  className="absolute inset-y-0 bg-line"
                  style={
                    group.bound === 'min'
                      ? { left: 0, width: `${widthOf(group.recommended)}%` }
                      : { left: `${widthOf(group.recommended)}%`, right: 0 }
                  }
                />
                <div
                  data-group={group.keys.join('-')}
                  data-verdict={group.verdict}
                  data-bound={group.bound}
                  className={`relative h-full ${style.bar}`}
                  // A pot with a few rupiah in it still shows something. A bar
                  // rounding away to nothing reads as a pot never used at all.
                  style={{ width: group.actual > 0n ? `max(2px, ${widthOf(group.actual)}%)` : '0' }}
                />
                {/* The recommendation, drawn as the line it is. The bar either
                    reaches it or passes it, and that crossing is the second cue
                    for anyone the colour does not reach. */}
                <div
                  data-marker={group.keys.join('-')}
                  aria-hidden="true"
                  className="absolute top-[-3px] h-[calc(100%+6px)] w-0.5 bg-ink"
                  style={{ left: `${widthOf(group.recommended)}%` }}
                />
              </div>

              <p className={`mt-2 text-xs ${style.text}`}>
                <span className="text-ink-muted">
                  {BOUND_WORD[group.bound]} {formatIdr(group.recommended)}
                  {group.verdict === 'healthy'
                    ? ', dan kamu di dalamnya.'
                    : group.verdict === 'short'
                      ? `, kurang ${formatIdr(group.gap)}.`
                      : `, lewat ${formatIdr(group.gap)}.`}
                </span>
              </p>

              {group.combined ? (
                <p className="mt-1 text-xs text-ink-faint">
                  {group.labels.join(' dan ')} dibaca sebagai satu angka, karena catatanmu
                  memfilekan keduanya sebagai pengeluaran yang sama. Memisahkannya butuh
                  keputusanmu soal mana yang bisa dilepas, bukan tebakan aplikasi ini.
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>

      <div className="border-t border-line p-4">
        <p className="text-sm text-ink-muted">
          {unassigned > 0n ? (
            <>
              {formatIdr(unassigned)} dari penghasilan bulan itu tidak masuk pos mana pun. Uang itu
              menumpuk di rekening tanpa diberi tugas, dan pos yang paling sering kekurangan ada
              di daftar atas.
            </>
          ) : unassigned < 0n ? (
            <>
              Pengeluarannya {formatIdr(-unassigned)} lebih besar daripada penghasilan bulan itu.
              Selisihnya diambil dari saldo yang sudah ada, jadi bulan seperti ini menyusutkan
              tumpukan meskipun tiap posnya kelihatan wajar sendiri-sendiri.
            </>
          ) : (
            <>Seluruh penghasilan bulan itu sudah masuk salah satu pos.</>
          )}
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          Angka kenyataannya median dari bulan-bulan yang sudah diimpor, bukan bulan terakhir,
          supaya satu bonus atau satu premi tahunan tidak jadi vonis tentang rumah tangganya.
          Pemetaannya lewat jenis cashflow yang kamu tetapkan sendiri, bukan tebakan atas nama
          kategori.
        </p>
      </div>

      {/* Wrapped, because a table ignores the one pixel width sr-only sets. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Pos</th>
              <th scope="col">Batas</th>
              <th scope="col">Dianjurkan</th>
              <th scope="col">Kenyataannya</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.keys.join('-')}>
                <th scope="row">{group.labels.join(' + ')}</th>
                <td>
                  {BOUND_TAG[group.bound]} {Math.round(group.share * 100)}%
                </td>
                <td>{formatIdr(group.recommended)}</td>
                <td>{formatIdr(group.actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
