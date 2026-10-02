'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapLibreMap, Marker, Popup } from 'maplibre-gl'
import { boundsOf, DOTS, isOverlay, JAKARTA, LOCALE, overlayLayers, SOURCE, STYLES, toFeatures, type Glow, type MapColors } from './map-layers'
import type { PlaceMode } from '@/lib/ledger/places'
import { legendGroups, type PlacePoint } from './view-model'

/**
 * The map itself: OpenFreeMap tiles under a heatmap and a dot per outlet.
 *
 * MapLibre is loaded only here, in the browser, and only when this mounts, so
 * no other page pays for 800 kB of map. Its worker comes from public/vendor
 * (scripts/vendor-maplibre.mjs) because the CSP allows no blob: workers.
 *
 * The map is a picture of the table under it, never the only way to the
 * figures: a screen reader, a device without WebGL and a blocked tile server
 * all still get every place and every amount from the list.
 */

export interface Draft {
  lat: number
  lng: number
}

interface Props {
  points: PlacePoint[]
  /** True while a merchant is being placed: a click on the map drops its point. */
  placing: boolean
  draft: Draft | null
  onPick: (draft: Draft) => void
  /** Called with the point's id: a merchant that moved house has several. */
  onMove: (pointId: string) => void
  /** Category groups switched off in the legend. */
  hidden: readonly string[]
  /** Which weight sizes the dots and feeds the glow. */
  mode: PlaceMode
  /** A glow per category group, or one accent glow for density alone. */
  glow: Glow['mode']
}

type Theme = 'light' | 'dark'

function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme
  if (chosen === 'light' || chosen === 'dark') return chosen
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** A colour as the browser resolved it; `light-dark()` is not something MapLibre can parse. */
function resolve(css: string): string {
  const probe = document.createElement('span')
  probe.style.color = css
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

/**
 * A category hue in this theme, as `rgb()`. The computed value of an oklch()
 * colour stays oklch(), which MapLibre cannot read either, so one pixel is
 * painted with it and read back in sRGB.
 */
function categoryColors(): (hue: number) => string {
  const pixel = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const cache = new Map<number, string>()
  return (hue) => {
    const known = cache.get(hue)
    if (known) return known
    const css = resolve(`oklch(var(--category-l) var(--category-c) ${hue})`)
    let color = css
    if (pixel) {
      pixel.clearRect(0, 0, 1, 1)
      pixel.fillStyle = css
      pixel.fillRect(0, 0, 1, 1)
      const [r, g, b] = pixel.getImageData(0, 0, 1, 1).data
      color = `rgb(${r}, ${g}, ${b})`
    }
    cache.set(hue, color)
    return color
  }
}

function themeColors(): MapColors {
  return {
    accent: resolve('var(--color-accent)'),
    strong: resolve('var(--color-accent-strong)'),
    surface: resolve('var(--color-surface)'),
  }
}

/** The popup, built from nodes rather than HTML so a merchant name can never be markup. */
function popupContent(point: PlacePoint, onMove: (pointId: string) => void): HTMLElement {
  const root = document.createElement('div')
  root.className = 'place-popup'
  const add = (tag: string, text: string, className: string, parent: HTMLElement = root) => {
    const node = document.createElement(tag)
    node.className = className
    node.textContent = text
    parent.append(node)
    return node
  }

  add('p', point.label, 'text-subhead font-medium text-ink')
  if (point.address) add('p', point.address, 'mt-0.5 text-footnote text-ink-muted line-clamp-2')

  const figures = document.createElement('dl')
  figures.className = 'mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-footnote'
  root.append(figures)
  const row = (term: string, value: string, mono = false) => {
    add('dt', term, 'text-ink-muted', figures)
    add('dd', value, `text-right text-ink ${mono ? 'tnum font-mono' : ''}`, figures)
  }
  row('Total', point.total, true)
  row('Kunjungan', `${point.visits} kali`)
  row('Per kunjungan', point.average, true)
  if (point.topCategory) row('Kategori', point.topCategory)
  if (point.usualTime) row('Biasanya', point.usualTime)
  add('p', point.span, 'mt-2 text-caption1 text-ink-faint')

  if (point.recent.length > 0) {
    const list = document.createElement('ul')
    list.className = 'mt-2 space-y-0.5 border-t border-line pt-2 text-footnote'
    list.setAttribute('aria-label', 'Kunjungan terakhir')
    root.append(list)
    // Three, so the popup fits inside the map at its shortest; the table has the rest.
    for (const visit of point.recent.slice(0, 3)) {
      const item = document.createElement('li')
      item.className = 'flex justify-between gap-3'
      list.append(item)
      add('span', visit.date, 'text-ink-muted', item)
      add('span', visit.amount, 'tnum font-mono text-ink', item)
    }
  }

  const move = add('button', 'Pindahkan titik', 'mt-2 inline-flex min-h-11 items-center text-subhead font-medium text-accent')
  move.setAttribute('type', 'button')
  move.addEventListener('click', () => onMove(point.pointId))
  return root
}

export function PlaceMap({ points, placing, draft, onPick, onMove, hidden, mode, glow }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const popup = useRef<Popup | null>(null)
  const library = useRef<typeof import('maplibre-gl') | null>(null)
  const [failed, setFailed] = useState(false)
  const [tilesFailed, setTilesFailed] = useState(false)

  // The newest props, for listeners registered once when the map was made.
  const latest = useRef({ points, placing, onPick, onMove, hidden, mode, glow })
  useEffect(() => {
    latest.current = { points, placing, onPick, onMove, hidden, mode, glow }
  })
  // Takes every overlay layer off and draws them again; set once the map exists.
  const redraw = useRef<() => void>(() => {})
  // Per theme: the same hue is a darker colour on light tiles than on dark ones.
  const colorOf = useRef<((hue: number) => string) | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    let unwatch = () => {}

    void (async () => {
      const maplibre = await import('maplibre-gl')
      if (cancelled || !container.current) return
      library.current = maplibre
      maplibre.setWorkerUrl(`/vendor/maplibre/${maplibre.getVersion()}/maplibre-gl-worker.mjs`)

      let theme = currentTheme()
      let instance: MapLibreMap
      try {
        instance = new maplibre.Map({
          container: container.current,
          style: STYLES[theme],
          center: JAKARTA,
          zoom: 10,
          locale: LOCALE,
          cooperativeGestures: true,
          attributionControl: { compact: true },
          maplibreLogo: false,
        })
      } catch (error) {
        // No WebGL, most often. The list below still has everything.
        console.error('[peta] peta gagal dibuat', error)
        setFailed(true)
        return
      }
      map.current = instance
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right')

      const drawOverlay = () => {
        colorOf.current = categoryColors()
        if (!instance.getSource(SOURCE)) {
          instance.addSource(SOURCE, { type: 'geojson', data: toFeatures(latest.current.points, latest.current.mode, colorOf.current) })
        }
        const { hidden, glow, points } = latest.current
        const spec: Glow =
          glow === 'density'
            ? { mode: 'density' }
            : { mode: 'groups', groups: legendGroups(points).map((group) => ({ name: group.name, color: colorOf.current!(group.hue) })) }
        for (const layer of overlayLayers(themeColors(), hidden, spec)) {
          if (!instance.getLayer(layer.id)) instance.addLayer(layer as never)
        }
      }
      redraw.current = () => {
        if (!instance.isStyleLoaded()) return
        for (const layer of instance.getStyle().layers ?? []) {
          if (isOverlay(layer.id)) instance.removeLayer(layer.id)
        }
        drawOverlay()
      }
      // Fires for the first style and again after every theme swap.
      instance.on('style.load', drawOverlay)

      instance.on('mouseenter', DOTS, () => {
        instance.getCanvas().style.cursor = 'pointer'
      })
      instance.on('mouseleave', DOTS, () => {
        instance.getCanvas().style.cursor = ''
      })
      instance.on('click', (event) => {
        if (latest.current.placing) {
          latest.current.onPick({ lat: event.lngLat.lat, lng: event.lngLat.lng })
          return
        }
        const [hit] = instance.queryRenderedFeatures(event.point, { layers: [DOTS] })
        const point = latest.current.points.find((candidate) => candidate.pointId === hit?.properties?.key)
        if (!point) return
        popup.current?.remove()
        popup.current = new maplibre.Popup({ maxWidth: '280px', focusAfterOpen: true })
          .setLngLat([point.lng, point.lat])
          .setDOMContent(popupContent(point, latest.current.onMove))
          .addTo(instance)
      })
      instance.on('error', (event) => {
        console.error('[peta] tile atau gaya peta gagal dimuat', event.error)
        // Only a failed style leaves the map blank; a single missing tile does not.
        if (!instance.isStyleLoaded()) setTilesFailed(true)
      })
      instance.on('style.load', () => setTilesFailed(false))

      const restyle = () => {
        const next = currentTheme()
        if (next === theme) return
        theme = next
        // The overlay is redrawn on style.load with colours for the new theme.
        instance.setStyle(STYLES[next], { diff: false })
      }
      const media = matchMedia('(prefers-color-scheme: dark)')
      const observer = new MutationObserver(restyle)
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
      media.addEventListener('change', restyle)
      unwatch = () => {
        observer.disconnect()
        media.removeEventListener('change', restyle)
      }
    })()

    return () => {
      cancelled = true
      unwatch()
      popup.current?.remove()
      marker.current?.remove()
      map.current?.remove()
      map.current = null
    }
  }, [])

  // New points after a filter: redraw, and reframe when the set of places changed.
  const keys = points.map((point) => point.key).join('|')
  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const apply = () => {
      ;(instance.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(toFeatures(latest.current.points, latest.current.mode, colorOf.current))
      const bounds = boundsOf(latest.current.points)
      if (bounds) instance.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 })
    }
    if (instance.isStyleLoaded()) apply()
    else instance.once('idle', apply)
  }, [keys])

  // Weights change with the reading even when the places do not.
  useEffect(() => {
    const source = map.current?.getSource(SOURCE) as GeoJSONSource | undefined
    source?.setData(toFeatures(points, mode, colorOf.current))
  }, [points, mode])

  /*
    A group switched off, the glow switched between groups and density, or a
    filter that changes which groups there are: the layers are drawn again,
    without moving the camera. A glow per group is a layer per group, so this
    is a redraw rather than a filter change.
  */
  const hiddenKey = hidden.join('|')
  const groupsKey = legendGroups(points).map((group) => group.name).join('|')
  useEffect(() => {
    redraw.current()
    popup.current?.remove()
  }, [hiddenKey, groupsKey, glow])

  useEffect(() => {
    const instance = map.current
    const maplibre = library.current
    if (!instance || !maplibre) return
    if (!draft) {
      marker.current?.remove()
      marker.current = null
      return
    }
    if (!marker.current) {
      marker.current = new maplibre.Marker({ color: themeColors().accent, draggable: true })
        .setLngLat([draft.lng, draft.lat])
        .addTo(instance)
      marker.current.on('dragend', () => {
        const at = marker.current?.getLngLat()
        if (at) latest.current.onPick({ lat: at.lat, lng: at.lng })
      })
    } else {
      marker.current.setLngLat([draft.lng, draft.lat])
    }
    if (!instance.getBounds().contains([draft.lng, draft.lat])) {
      const camera = { center: [draft.lng, draft.lat] as [number, number], zoom: Math.max(instance.getZoom(), 15) }
      // A flight across the city is exactly the travel reduced motion asks to skip.
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) instance.jumpTo(camera)
      else instance.flyTo(camera)
    }
  }, [draft])

  useEffect(() => {
    const canvas = map.current?.getCanvas()
    if (canvas) canvas.style.cursor = placing ? 'crosshair' : ''
  }, [placing])

  if (failed) {
    return (
      <div className="squircle flex h-[55vh] min-h-80 items-center justify-center rounded-md bg-surface p-6 text-center shadow-xs">
        <p className="max-w-sm text-subhead text-ink-muted">
          Peta tidak bisa digambar di perangkat ini. Semua tempat dan angkanya tetap ada di daftar di
          bawah.
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        ref={container}
        role="region"
        aria-label="Peta belanja. Angka yang sama ada di daftar Tempat di bawahnya."
        className="place-map squircle h-[55vh] min-h-80 overflow-hidden rounded-md bg-sunken shadow-xs sm:h-[60vh]"
      />
      {/* Opaque, not glass: it sits over the map, which DESIGN.md §3 keeps flat. */}
      {tilesFailed ? (
        <p
          role="status"
          className="absolute inset-x-3 top-3 rounded-sm bg-surface px-3 py-2 text-footnote text-ink shadow-sm"
        >
          Peta dasar dari OpenFreeMap gagal dimuat. Semua tempat dan angkanya tetap ada di daftar di bawah.
        </p>
      ) : null}
    </div>
  )
}
