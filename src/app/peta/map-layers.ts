import type { PlacePoint } from './view-model'

/**
 * What the map draws on top of the base tiles, with no DOM in it so it can be
 * tested on its own. `place-map.tsx` feeds it colours read from the theme.
 *
 * Two layers over one source. Zoomed out, a heatmap: where the weight gathers,
 * not where each shop is, because forty pins on one mall say less than one
 * glow. Zoomed in, the glow fades and a dot per outlet takes over, sized by
 * the same weight, coloured by its category group and clickable for its visits.
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
 * The points as GeoJSON. `colorOf` turns a group's hue into a colour MapLibre
 * can parse; without it the dots fall back to the accent.
 */
export function toFeatures(points: readonly PlacePoint[], colorOf?: (hue: number) => string) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [point.lng, point.lat] },
      properties: {
        key: point.pointId,
        weight: point.weight,
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
 * The heatmap stays one hue on purpose: glows of several hues overlapping
 * mix into a colour no group has. The groups show in the dots, and hiding a
 * group in the legend takes it out of the glow as well.
 */
export function overlayLayers(colors: MapColors, hidden: readonly string[] = []) {
  const filter = groupFilter(hidden)
  // A floor under every weight, so a place visited once still glows a little.
  const weight = ['+', 0.15, ['*', 0.85, ['get', 'weight']]]
  const fadeIn = ['interpolate', ['linear'], ['zoom'], 11, 0, 12.5, 1]

  const layers = [
    {
      id: HEAT,
      type: 'heatmap' as const,
      source: SOURCE,
      maxzoom: 16,
      paint: {
        'heatmap-weight': weight,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 15, 3],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 26, 13, 42, 16, 64],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.85, 15.5, 0.25],
        // One hue deepening, not a rainbow and not red: red in this app means
        // over budget, and a place where money was spent is not a warning.
        // `strong` is the accent's own high-contrast step, so the peak reads
        // as more on both the light and the dark tiles.
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          withAlpha(colors.accent, 0),
          0.15,
          withAlpha(colors.accent, 0.35),
          0.5,
          colors.accent,
          1,
          colors.strong,
        ],
      },
    },
    {
      id: DOTS,
      type: 'circle' as const,
      source: SOURCE,
      minzoom: 11,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'weight'], 0, 5, 1, 14],
        'circle-color': ['coalesce', ['get', 'color'], colors.accent],
        'circle-stroke-color': colors.surface,
        'circle-stroke-width': 2,
        'circle-opacity': fadeIn,
        'circle-stroke-opacity': fadeIn,
      },
    },
  ]
  return filter ? layers.map((layer) => ({ ...layer, filter })) : layers
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
