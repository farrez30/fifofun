import { describe, expect, it } from 'vitest'
import { boundsOf, overlayLayers, STYLES, toFeatures, withAlpha } from './map-layers'
import { MAP_TILES } from '@/lib/csp'

describe('withAlpha', () => {
  it('sets the opacity of a resolved colour', () => {
    expect(withAlpha('rgb(0, 113, 164)', 0.35)).toBe('rgba(0, 113, 164, 0.35)')
    expect(withAlpha('rgba(64, 200, 224, 1)', 0)).toBe('rgba(64, 200, 224, 0)')
    expect(withAlpha('rgb(0 113 164)', 0.5)).toBe('rgba(0, 113, 164, 0.5)')
  })

  it('leaves a colour it cannot read', () => {
    expect(withAlpha('color(srgb 0 0.4 0.6)', 0.5)).toBe('color(srgb 0 0.4 0.6)')
  })
})

describe('toFeatures', () => {
  it('puts longitude first, as GeoJSON wants', () => {
    const point = { pointId: 'l1', key: 'boga rasaa', lat: -6.23, lng: 106.85, weight: 0.5 }
    const [feature] = toFeatures([point as never]).features
    expect(feature.geometry.coordinates).toEqual([106.85, -6.23])
    // The point, not the merchant: a merchant that moved house is two dots.
    expect(feature.properties).toEqual({ key: 'l1', weight: 0.5 })
  })
})

describe('overlayLayers', () => {
  const layers = overlayLayers({ accent: 'rgb(0, 113, 164)', strong: 'rgb(0, 86, 125)', surface: 'rgb(255, 255, 255)' })

  it('glows when zoomed out and hands over to dots when zoomed in', () => {
    expect(layers.map((layer) => layer.type)).toEqual(['heatmap', 'circle'])
    expect(layers[0].maxzoom).toBeGreaterThan(layers[1].minzoom as number)
  })

  it('starts the heatmap fully transparent so empty streets stay clear', () => {
    const ramp = layers[0].paint['heatmap-color'] as unknown[]
    expect(ramp[4]).toBe('rgba(0, 113, 164, 0)')
  })
})

describe('STYLES', () => {
  it('only names the host the CSP allows', () => {
    for (const url of Object.values(STYLES)) expect(new URL(url).origin).toBe(MAP_TILES)
  })
})

describe('boundsOf', () => {
  it('wraps every point, west-south-east-north', () => {
    expect(boundsOf([{ lat: -6.2, lng: 106.8 }, { lat: -6.9, lng: 107.6 }])).toEqual([106.8, -6.9, 107.6, -6.2])
    expect(boundsOf([])).toBeNull()
  })
})
