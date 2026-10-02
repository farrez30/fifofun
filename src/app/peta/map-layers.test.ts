import { describe, expect, it } from 'vitest'
import { boundsOf, DOTS, groupFilter, HEAT, isOverlay, overlayLayers, STYLES, toFeatures, withAlpha } from './map-layers'
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
    const point = { pointId: 'l1', key: 'boga rasaa', lat: -6.23, lng: 106.85, weights: { total: 0.5, visits: 1, average: 0.2 }, group: 'Sosial', hue: 263 }
    const [feature] = toFeatures([point as never], 'total').features
    expect(feature.geometry.coordinates).toEqual([106.85, -6.23])
    // The point, not the merchant: a merchant that moved house is two dots.
    expect(feature.properties).toEqual({ key: 'l1', weight: 0.5, group: 'Sosial' })
  })

  it("carries the colour the theme gives the group's hue", () => {
    const point = { pointId: 'l1', lat: -6.23, lng: 106.85, weights: { total: 0.5, visits: 1, average: 0.2 }, group: 'Sosial', hue: 263 }
    const [feature] = toFeatures([point as never], 'total', (hue) => `rgb(${hue}, 0, 0)`).features
    expect(feature.properties.color).toBe('rgb(263, 0, 0)')
  })
})

describe('toFeatures under each reading', () => {
  it('weighs the same point by whichever reading is chosen', () => {
    const point = { pointId: 'l1', lat: -6.23, lng: 106.85, weights: { total: 0.5, visits: 1, average: 0.2 }, group: 'Sosial', hue: 263 }
    expect(toFeatures([point as never], 'visits').features[0].properties.weight).toBe(1)
    expect(toFeatures([point as never], 'average').features[0].properties.weight).toBe(0.2)
  })
})

describe('groupFilter', () => {
  it('filters nothing while every group is shown', () => {
    expect(groupFilter([])).toBeNull()
  })

  it('drops the hidden groups', () => {
    expect(groupFilter(['Transport', 'Rumah'])).toEqual(['!', ['in', ['get', 'group'], ['literal', ['Transport', 'Rumah']]]])
  })
})

describe('overlayLayers', () => {
  const layers = overlayLayers({ accent: 'rgb(0, 113, 164)', strong: 'rgb(0, 86, 125)', surface: 'rgb(255, 255, 255)' })

  it('draws the coloured dots over the glow at every zoom, so the legend always has something to point at', () => {
    expect(layers.map((layer) => layer.type)).toEqual(['heatmap', 'circle'])
    expect('minzoom' in layers[1]).toBe(false)
    expect('circle-opacity' in layers[1].paint).toBe(false)
  })

  it('colours a dot by its group and falls back to the accent', () => {
    expect(layers[1].paint['circle-color']).toEqual(['coalesce', ['get', 'color'], 'rgb(0, 113, 164)'])
  })

  it('takes a hidden group out of the glow and the dots alike', () => {
    expect('filter' in layers[0]).toBe(false)
    const filtered = overlayLayers({ accent: 'a', strong: 'b', surface: 'c' }, ['Transport'])
    for (const layer of filtered) expect(layer).toHaveProperty('filter', groupFilter(['Transport']))
  })

  it('gives every visible group its own glow in its own colour, dots on top', () => {
    const groups = [
      { name: 'Transport', color: 'rgb(200, 150, 0)' },
      { name: 'Sosial', color: 'rgb(90, 120, 250)' },
      { name: 'Rumah', color: 'rgb(170, 120, 250)' },
    ]
    const drawn = overlayLayers({ accent: 'a', strong: 'b', surface: 'c' }, ['Rumah'], { mode: 'groups', groups })
    expect(drawn.map((layer) => layer.id)).toEqual([`${HEAT}-0`, `${HEAT}-1`, DOTS])
    expect(drawn[0].filter).toEqual(['==', ['get', 'group'], 'Transport'])
    const ramp = drawn[1].paint['heatmap-color'] as unknown[]
    expect(ramp.at(-1)).toBe('rgb(90, 120, 250)')
    expect(drawn.every((layer) => isOverlay(layer.id))).toBe(true)
    expect(isOverlay('road-label')).toBe(false)
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
