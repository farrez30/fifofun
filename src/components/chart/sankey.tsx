import type { ReactNode } from 'react'
import { Money } from '@/components/money'
import { formatIdr, formatIdrCompact, senToRupiahNumber } from '@/lib/money'

/**
 * A Sankey diagram of where money goes.
 *
 * This is the one view the spreadsheet cannot produce, and it answers the
 * question people actually ask, which is not "how much did I spend on food" but
 * "where did it all go". A ribbon whose width is the amount makes the answer
 * visible before any number is read.
 *
 * Drawn by hand rather than with d3-sankey. The layout needed here is a strict
 * left-to-right flow with no cycles and no crossing minimisation worth the name,
 * which is a hundred lines rather than a dependency, and drawing it directly
 * means the ribbons take their colour from the theme tokens and dark mode needs
 * no separate configuration.
 */

export type FlowTone = 'income' | 'spend' | 'save' | 'neutral' | 'warn'

export interface SankeyNode {
  id: string
  label: string
  /** Which vertical band the node sits in, left to right. */
  column: number
  tone?: FlowTone
  /**
   * The hue that identifies this category everywhere else in the app. It says
   * which category a ribbon belongs to, never what the category means, and the
   * label is printed beside it regardless.
   */
  hue?: number
  /** Nodes in a column sort by this first, so one destination's categories stay together. */
  order?: number
}

export interface SankeyLink {
  source: string
  target: string
  value: bigint
}

interface Props {
  nodes: SankeyNode[]
  links: SankeyLink[]
  /** Left out, the drawing takes the height its own labels need. */
  height?: number
  caption: string
  /**
   * Prefix for the gradient ids. Two diagrams on one page must not share a
   * definition, and an index is safer than a slug of a category name.
   */
  id?: string
  /**
   * Rendered under the diagram, for whatever the drawing had to leave out.
   *
   * A Sankey has to fold its tail into one node or the thin ribbons make the
   * thick ones unreadable, and that node is a dead end: "9 kategori lain" names
   * a total and offers no way to find out what is in it. What gets folded is
   * the caller's decision, so the way out of it is too.
   */
  note?: ReactNode
}

const TONE_FILL: Record<FlowTone, string> = {
  income: 'var(--color-under)',
  spend: 'var(--color-accent)',
  save: 'var(--color-accent-strong)',
  warn: 'var(--color-warn)',
  neutral: 'var(--color-line-strong)',
}

/**
 * A node's own colour.
 *
 * The tone says what kind of movement it is, which is what the three or four
 * destinations need. A category node also carries a hue, and there the colour
 * is identity rather than meaning: the same Belanja in the diagram, in the
 * month detail and in the review queue. Lightness and chroma come from the
 * theme, so one stored hue is right in both colour schemes.
 */
function fillOf(node: { tone?: FlowTone; hue?: number }): string {
  return node.hue === undefined
    ? TONE_FILL[node.tone ?? 'neutral']
    : `oklch(var(--category-l) var(--category-c) ${node.hue})`
}

/*
  The viewBox width is kept close to the width the figure actually gets on a
  laptop. Drawing at 960 and scaling down to fit shrinks every label with it,
  which is how a diagram ends up technically complete and practically unreadable.
*/
const WIDTH = 760
const NODE_WIDTH = 12
const NODE_GAP = 10
const PADDING_Y = 8

/*
  Room reserved on both sides for labels.

  Without it the outermost nodes sit on the edge of the viewBox and their labels
  are drawn outside it, which clips them silently: the diagram still renders and
  the reader simply never sees the amounts. Labels are placed outward into these
  gutters, away from the ribbons, which is also how d3-sankey lays them out.
*/
const LABEL_GUTTER = 150

/*
  SVG text does not wrap and does not know how wide it is until it is drawn, so a
  long category name runs straight off the edge of the viewBox and disappears
  without any error. Names are cut to fit the gutter and the full one stays
  reachable in the tooltip and in the table below.
*/
const LABEL_MAX_CHARS = 17

function fit(label: string): string {
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS - 1)}…` : label
}
const LABEL_OFFSET = 8

/*
  The least vertical room a label can have before it collides with the one below.

  A label is two lines, a name and an amount, and it is centred on its node. Once
  a node is thinner than that, which every small category is, the label is taller
  than the thing it belongs to and the next one is written across it. The picture
  still renders and two amounts become one smudge.

  Measured rather than derived: a browser lays the two lines out into a box 32.1
  units tall here, which is more than the font sizes and the offset between them
  add up to, because a line box is taller than its font. Guessing at those
  metrics would be a formula that looks principled and is wrong, so the number is
  the measurement plus a little air, and a browser test fails if it ever stops
  being enough.
*/
const LABEL_MIN_GAP = 34

/*
  How far a label reaches above and below the point it is anchored at.

  The name sits on the anchor and the amount fifteen units under it, so a label
  is not centred on its own anchor: it reaches about a line's ascent upwards
  and the second line plus its descent downwards. Both ends matter now that
  labels are moved in both directions, because a label pushed to the very top
  of the drawing would have its first line outside the frame, where SVG text is
  not clipped with an error and simply is not there.
*/
const LABEL_ABOVE = 14
const LABEL_BELOW = 22

interface Placed extends SankeyNode {
  x: number
  y: number
  height: number
  value: number
  /** Where the label sits, which is the node's middle unless that collides. */
  labelY: number
  /** Running offsets used while attaching ribbons. */
  outUsed: number
  inUsed: number
}

/** The room one label needs, which is what a column of them has to be given. */
const ROW = LABEL_MIN_GAP + NODE_GAP

export function Sankey({ nodes, links, height: fixedHeight, caption, note, id }: Props) {
  const positive = links.filter((link) => link.value > 0n)

  if (nodes.length === 0 || positive.length === 0) {
    return (
      <figure className="border border-line bg-surface p-6">
        <figcaption className="text-sm font-medium text-ink">{caption}</figcaption>
        <p className="mt-2 text-sm text-ink-muted">
          Belum ada aliran uang yang bisa digambar untuk periode ini.
        </p>
      </figure>
    )
  }

  // A node is as tall as the larger of what enters and what leaves it. Using
  // one side only makes a node that both receives and spends look wrong.
  const inflow = new Map<string, number>()
  const outflow = new Map<string, number>()
  for (const link of positive) {
    const value = senToRupiahNumber(link.value)
    outflow.set(link.source, (outflow.get(link.source) ?? 0) + value)
    inflow.set(link.target, (inflow.get(link.target) ?? 0) + value)
  }

  const columns = [...new Set(nodes.map((node) => node.column))].sort((a, b) => a - b)
  const columnTotals = columns.map((column) =>
    nodes
      .filter((node) => node.column === column)
      .reduce(
        (sum, node) => sum + Math.max(inflow.get(node.id) ?? 0, outflow.get(node.id) ?? 0),
        0,
      ),
  )

  const heaviest = Math.max(...columnTotals, 1)
  const tallestColumn = Math.max(
    ...columns.map((column) => nodes.filter((n) => n.column === column).length),
    1,
  )
  /*
    Tall enough for the labels it has to carry.

    A diagram naming every category can hold twenty nodes in a column, and at a
    fixed 420 the labels would be nudged down past each other until the last
    few sat outside the drawing. The floor stays 420 so a small month looks the
    way it always did; past that the picture grows and the page scrolls, which
    is the honest trade.
  */
  const height = fixedHeight ?? Math.max(420, tallestColumn * ROW)
  const usable = height - PADDING_Y * 2 - NODE_GAP * (tallestColumn - 1)
  const scale = usable / heaviest

  const span = WIDTH - LABEL_GUTTER * 2 - NODE_WIDTH
  const columnX = (column: number) =>
    LABEL_GUTTER +
    (columns.length === 1 ? 0 : (columns.indexOf(column) / (columns.length - 1)) * span)

  const placed = new Map<string, Placed>()
  for (const column of columns) {
    const inColumn = nodes
      .filter((node) => node.column === column)
      .map((node) => ({
        node,
        value: Math.max(inflow.get(node.id) ?? 0, outflow.get(node.id) ?? 0),
      }))
      // Grouped by destination where one is given, then largest first, which
      // keeps the thick ribbons near the top and stops the diagram reading as
      // noise.
      .sort((a, b) => (a.node.order ?? 0) - (b.node.order ?? 0) || b.value - a.value)

    /*
      Labels are nudged down the column only as far as it takes to stop them
      overlapping, and never above the node they name.

      One forward pass used to be enough, when a column held four nodes and the
      drawing had room underneath. With twenty of them the last few run out of
      column: each is pushed a label's height below the one before, the bottom
      clamp catches them, and three names pile up in the same place. So the
      forward pass is followed by a backward one that lifts whatever the clamp
      caught, which is the standard way out and costs one more loop.
    */
    const laid: { node: SankeyNode; value: number; y: number; height: number; labelY: number }[] = []
    let y = PADDING_Y
    let lastLabel = Number.NEGATIVE_INFINITY
    for (const { node, value } of inColumn) {
      const nodeHeight = Math.max(2, value * scale)
      const labelY = Math.min(
        height - LABEL_BELOW,
        Math.max(y + nodeHeight / 2, lastLabel + LABEL_MIN_GAP),
      )
      lastLabel = labelY
      laid.push({ node, value, y, height: nodeHeight, labelY })
      y += nodeHeight + NODE_GAP
    }

    for (let i = laid.length - 2; i >= 0; i--) {
      const ceiling = laid[i + 1].labelY - LABEL_MIN_GAP
      // Never above the top of the drawing, and only ever moved upward here.
      if (laid[i].labelY > ceiling) laid[i].labelY = Math.max(LABEL_ABOVE, ceiling)
    }

    for (const { node, value, y: top, height: nodeHeight, labelY } of laid) {
      placed.set(node.id, {
        ...node,
        x: columnX(column),
        y: top,
        height: nodeHeight,
        value,
        labelY,
        outUsed: 0,
        inUsed: 0,
      })
    }
  }

  // Ribbons follow the same largest-first order as the nodes so the two agree.
  const ordered = [...positive].sort((a, b) => (b.value > a.value ? 1 : -1))

  const ribbons = ordered.flatMap((link) => {
    const from = placed.get(link.source)
    const to = placed.get(link.target)
    if (!from || !to) return []

    const thickness = Math.max(1, senToRupiahNumber(link.value) * scale)
    const y0 = from.y + from.outUsed
    const y1 = to.y + to.inUsed
    from.outUsed += thickness
    to.inUsed += thickness

    const x0 = from.x + NODE_WIDTH
    const x1 = to.x
    const midpoint = x0 + (x1 - x0) / 2

    const path = [
      `M ${x0} ${y0}`,
      `C ${midpoint} ${y0}, ${midpoint} ${y1}, ${x1} ${y1}`,
      `L ${x1} ${y1 + thickness}`,
      `C ${midpoint} ${y1 + thickness}, ${midpoint} ${y0 + thickness}, ${x0} ${y0 + thickness}`,
      'Z',
    ].join(' ')

    return [{ link, path, from: fillOf(from), to: fillOf(to) }]
  })

  /*
    One gradient per ribbon, from the colour of where it starts to the colour of
    where it lands. With every category named, a column of twenty identical
    teal ribbons is a picture that hides its own answer; a ribbon that arrives
    the colour of its category can be followed by eye.

    Defined with `<defs>` and inline style attributes rather than a stylesheet,
    because the content security policy allows no `<style>` element without a
    nonce, and because `var()` has to resolve against the theme in both colour
    schemes.
  */
  const prefix = id ?? `sankey-${caption.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  return (
    <figure className="sankey border border-line bg-surface p-4">
      <figcaption className="mb-3 text-sm font-medium text-ink">{caption}</figcaption>

      <div
        className="relative overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={caption}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          /*
            A floor on the drawn width, not a fixed one.

            Left to shrink freely, a 760-wide diagram in a 375px phone renders
            its 13px labels at about 6px, which is present but unreadable. Below
            this floor it scrolls sideways instead, and the container around it
            is focusable so a keyboard can reach that scroll.
          */
          className="h-auto w-full min-w-[40rem]"
          role="img"
          aria-label={caption}
        >
          <defs>
            {ribbons.map((ribbon, index) => (
              <linearGradient key={`${prefix}-g${index}`} id={`${prefix}-g${index}`}>
                <stop offset="0%" style={{ stopColor: ribbon.from }} />
                <stop offset="100%" style={{ stopColor: ribbon.to }} />
              </linearGradient>
            ))}
          </defs>

          <g>
            {ribbons.map(({ link, path }, index) => (
              <path
                key={`${link.source}-${link.target}`}
                data-ribbon={`${link.source}-${link.target}`}
                d={path}
                fill={`url(#${prefix}-g${index})`}
                opacity={0.28}
              >
                <title>{`${placed.get(link.source)?.label} ke ${placed.get(link.target)?.label}: ${formatIdr(link.value)}`}</title>
              </path>
            ))}
          </g>

          <g>
            {[...placed.values()].map((node) => {
              // The first column labels leftwards and every other column
              // rightwards, so no label is ever drawn on top of a ribbon.
              const toLeft = node.column === columns[0]
              const labelX = toLeft ? node.x - LABEL_OFFSET : node.x + NODE_WIDTH + LABEL_OFFSET

              return (
                <g key={node.id}>
                  <rect
                    x={node.x}
                    y={node.y}
                    width={NODE_WIDTH}
                    height={node.height}
                    fill={fillOf(node)}
                    rx={2}
                  />
                  {/* Name and amount on separate lines. Side by side, a long
                      name pushes the amount out of the gutter and it vanishes. */}
                  <text
                    x={labelX}
                    y={node.labelY}
                    textAnchor={toLeft ? 'end' : 'start'}
                    fontSize={13}
                    fill="var(--color-ink)"
                  >
                    <title>{`${node.label}: ${formatIdr(BigInt(Math.round(node.value * 100)))}`}</title>
                    <tspan dy={node.height > 26 ? 0 : -1}>{fit(node.label)}</tspan>
                    <tspan x={labelX} dy={15} fontSize={11.5} fill="var(--color-ink-faint)">
                      {formatIdrCompact(BigInt(Math.round(node.value * 100)))}
                    </tspan>
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      {note ? <div className="mt-3 border-t border-line pt-3">{note}</div> : null}

      {/* The picture carries the shape; the table carries the facts. */}
      {/*
        Wrapped rather than marked directly. A table ignores the one pixel width
        that sr-only sets and lays itself out to fit its content, so the hidden
        table stretched the document and every narrow screen scrolled sideways
        for text nobody can see. A div honours the width and clips it.
      */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Dari</th>
              <th scope="col">Ke</th>
              <th scope="col">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((link) => (
              <tr key={`${link.source}-${link.target}`}>
                <td>{placed.get(link.source)?.label ?? link.source}</td>
                <td>{placed.get(link.target)?.label ?? link.target}</td>
                <td>{formatIdr(link.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

/**
 * The way out of the folded tail node.
 *
 * A Sankey has to gather its smallest flows into one node or the thin ribbons
 * make the thick ones unreadable, and that node is a dead end: "9 kategori lain"
 * names a total and offers no way to find out what is in it. The same failure
 * the funds page had, and the same fix, which is to say what was left out and
 * where it went rather than hoping nobody asks.
 *
 * Behind a summary rather than listed open, because the tail is by definition
 * the part nobody needs by default.
 */
export function FoldedCategories({
  folded,
  into,
}: {
  folded: { category: string; amount: bigint }[]
  /** The destination they were all gathered under. */
  into: string | null
}) {
  if (folded.length === 0) return null

  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-accent underline underline-offset-2">
        Lihat {folded.length} kategori yang digabung
      </summary>
      <p className="mt-2 text-ink-muted">
        Masing-masing terlalu kecil untuk digambar sendiri: pita setebal satu piksel tidak
        membawa informasi dan membuat yang tebal jadi susah dibaca.
        {into ? ` Semuanya masuk ${into.toLowerCase()}.` : ''}
      </p>
      <ul className="mt-2 space-y-1">
        {folded.map((row) => (
          <li
            key={row.category}
            data-folded={row.category}
            className="flex justify-between gap-3 text-ink-muted"
          >
            <span>{row.category}</span>
            <Money sen={row.amount} className="shrink-0" />
          </li>
        ))}
      </ul>
    </details>
  )
}
