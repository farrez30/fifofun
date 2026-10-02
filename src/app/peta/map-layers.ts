import type { PlaceMode } from '@/lib/ledger/places'
import type { PlacePoint } from './view-model'

/**
 * What the map draws on top of the base tiles, with no DOM in it so it can be
 * tested on its own. `place-map.tsx` feeds it colours read from the theme.
 *
 * Layers over one source. A heatmap (one per category group, or one for all
 * of it; see `Glow`) says where the weight gathers, not where each shop is,
 * because forty pins on one mall say less than one glow;
 * zoomed in, it fades. On top of it, at every zoom, a dot per outlet sized by
 * the same weight and coloured by its category group: small from far away,
 * full size up close, and clickable for its visits. The dots used to wait
 * for zoom 11, which left the legend's colours invisible on the city view the
 * map opens on.
 */

export const SOURCE = 'places'
export const HEAT = 'places-heat'
export const DOTS = 'places-dots'

/** OpenFreeMap's styles; both are free of an API key and want attribution, which the style carries. */
export const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const

/** Monas, for a household with nothing placed yet. */
export const JAKARTA: [number, number] = [106.8272, -6.1754]

export interface MapColors {
  accent: string
  /** The accent at its strongest: darker on light tiles, lighter on dark ones. */
  strong: string
  surface: string
}

/** `rgb(1, 2, 3)` or `rgba(1, 2, 3, 0.5)` at a new opacity. Anything else comes back as it was. */
export function withAlpha(color: string, alpha: number): string {
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color)
  return match ? `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})` : color
}

/**
 * The points as GeoJSON, weighed for one reading. `colorOf` turns a group's
 * hue into a colour MapLibre can parse; without it the dots fall back to the
 * accent.
 */
export function toFeatures(points: readonly PlacePoint[], mode: PlaceMode, colorOf?: (hue: number) => string) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [point.lng, point.lat] },
      properties: {
        key: point.pointId,
        weight: point.weights[mode],
        group: point.group,
        ...(colorOf ? { color: colorOf(point.hue) } : {}),
      },
    })),
  }
}

/** Keeps every feature whose group is not hidden, or null for no filter at all. */
export function groupFilter(hidden: readonly string[]) {
  return hidden.length === 0 ? null : ['!', ['in', ['get', 'group'], ['literal', [...hidden]]]]
}

/**
 * How the glow is coloured. `groups` gives every category group its own glow
 * in its own hue, so the glow and the dots agree; where groups crowd one mall
 * the glows overlap and blend, which reads as "mixed" rather than as any one
 * group. `density` is one accent hue for all of it, for reading only where
 * the weight gathers.
 */
export type Glow = { mode: 'density' } | { mode: 'groups'; groups: readonly { name: string; color: string }[] }

export interface OverlayLayer {
  id: string
  type: 'heatmap' | 'circle'
  source: string
  maxzoom?: number
  filter?: unknown
  paint: Record<string, unknown>
}

/** Every layer this file adds, so a redraw can take them all off first. */
export function isOverlay(id: string): boolean {
  return id === DOTS || id === HEAT || id.startsWith(`${HEAT}-`)
}

function heatLayer(id: string, color: string, peak: string, filter: unknown, opacity: number): OverlayLayer {
  // A floor under every weight, so a place visited once still glows a little.
  const weight = ['+', 0.15, ['*', 0.85, ['get', 'weight']]]
  return {
    id,
    type: 'heatmap',
    source: SOURCE,
    maxzoom: 16,
    ...(filter ? { filter } : {}),
    paint: {
      'heatmap-weight': weight,
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 15, 3],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 26, 13, 42, 16, 64],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, opacity, 15.5, 0.25],
      // One hue deepening, never a rainbow within a layer and never red: red in
      // this app means over budget, and a place where money was spent is not a
      // warning.
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        withAlpha(color, 0),
        0.15,
        withAlpha(color, 0.35),
        0.5,
        color,
        1,
        peak,
      ],
    },
  }
}

export function overlayLayers(
  colors: MapColors,
  hidden: readonly string[] = [],
  glow: Glow = { mode: 'density' },
): OverlayLayer[] {
  const filter = groupFilter(hidden)
  // `strong` is the accent's own high-contrast step, so the peak reads as more
  // on both the light and the dark tiles. A group's glow has no second step,
  // so it peaks at its own colour and is a little fainter, because several of
  // them can stack on one spot.
  const heats =
    glow.mode === 'density'
      ? [heatLayer(HEAT, colors.accent, colors.strong, filter, 0.85)]
      : glow.groups
          .filter((group) => !hidden.includes(group.name))
          .map((group, index) =>
            heatLayer(`${HEAT}-${index}`, group.color, group.color, ['==', ['get', 'group'], group.name], 0.7),
          )

  const dots: OverlayLayer = {
    id: DOTS,
    type: 'circle',
    source: SOURCE,
    ...(filter ? { filter } : {}),
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        9,
        ['interpolate', ['linear'], ['get', 'weight'], 0, 2.5, 1, 6],
        13,
        ['interpolate', ['linear'], ['get', 'weight'], 0, 5, 1, 14],
      ],
      'circle-color': ['coalesce', ['get', 'color'], colors.accent],
      'circle-stroke-color': colors.surface,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 13, 2],
    },
  }
  return [...heats, dots]
}

/** West, south, east, north around every point, or null when there are none. */
export function boundsOf(points: readonly Pick<PlacePoint, 'lat' | 'lng'>[]): [number, number, number, number] | null {
  if (points.length === 0) return null
  const lngs = points.map((point) => point.lng)
  const lats = points.map((point) => point.lat)
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
}

/** The control labels MapLibre would otherwise show in English. */
export const LOCALE = {
  'AttributionControl.ToggleAttribution': 'Tampilkan atribusi',
  'AttributionControl.MapFeedback': 'Masukan untuk peta',
  'FullscreenControl.Enter': 'Layar penuh',
  'FullscreenControl.Exit': 'Keluar dari layar penuh',
  'Map.Title': 'Peta belanja',
  'Marker.Title': 'Titik yang akan disimpan',
  'NavigationControl.ResetBearing': 'Seret untuk memutar, klik untuk menghadap utara',
  'NavigationControl.ZoomIn': 'Perbesar',
  'NavigationControl.ZoomOut': 'Perkecil',
  'Popup.Close': 'Tutup',
  'CooperativeGesturesHandler.WindowsHelpText': 'Tahan Ctrl sambil menggulir untuk memperbesar peta',
  'CooperativeGesturesHandler.MacHelpText': 'Tahan ⌘ sambil menggulir untuk memperbesar peta',
  'CooperativeGesturesHandler.MobileHelpText': 'Geser peta dengan dua jari',
}
