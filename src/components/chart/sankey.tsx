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
}

export interface SankeyLink {
  source: string
  target: string
  value: bigint
}

interface Props {
  nodes: SankeyNode[]
  links: SankeyLink[]
  height?: number
  caption: string
}

const TONE_FILL: Record<FlowTone, string> = {
  income: 'var(--color-under)',
  spend: 'var(--color-accent)',
  save: 'var(--color-accent-strong)',
  warn: 'var(--color-warn)',
  neutral: 'var(--color-line-strong)',
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

interface Placed extends SankeyNode {
  x: number
  y: number
  height: number
  value: number
  /** Running offsets used while attaching ribbons. */
  outUsed: number
  inUsed: number
}

export function Sankey({ nodes, links, height = 420, caption }: Props) {
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
      // Largest first, which keeps the thick ribbons near the top and stops the
      // diagram reading as noise.
      .sort((a, b) => b.value - a.value)

    let y = PADDING_Y
    for (const { node, value } of inColumn) {
      const nodeHeight = Math.max(2, value * scale)
      placed.set(node.id, {
        ...node,
        x: columnX(column),
        y,
        height: nodeHeight,
        value,
        outUsed: 0,
        inUsed: 0,
      })
      y += nodeHeight + NODE_GAP
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

    return [{ link, path, tone: to.tone ?? from.tone ?? 'neutral' }]
  })

  return (
    <figure className="border border-line bg-surface p-4">
      <figcaption className="mb-3 text-sm font-medium text-ink">{caption}</figcaption>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={caption}
        >
          <g>
            {ribbons.map(({ link, path, tone }) => (
              <path
                key={`${link.source}-${link.target}`}
                d={path}
                fill={TONE_FILL[tone]}
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
              const centre = node.y + node.height / 2

              return (
                <g key={node.id}>
                  <rect
                    x={node.x}
                    y={node.y}
                    width={NODE_WIDTH}
                    height={node.height}
                    fill={TONE_FILL[node.tone ?? 'neutral']}
                    rx={2}
                  />
                  {/* Name and amount on separate lines. Side by side, a long
                      name pushes the amount out of the gutter and it vanishes. */}
                  <text
                    x={labelX}
                    y={centre}
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

      {/* The picture carries the shape; the table carries the facts. */}
      <table className="sr-only">
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
    </figure>
  )
}
