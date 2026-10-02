// Copies MapLibre's worker into public/, so the map's worker is same-origin.
//
//   node scripts/vendor-maplibre.mjs
//
// Runs before `next dev` and `next build`. MapLibre 6 starts its worker from a
// file next to its own module, but once the bundler has moved that module into
// a chunk there is no file next to it, and the fallback is a blob: worker that
// the CSP refuses on purpose. The page points MapLibre here instead with
// setWorkerUrl (src/app/peta/place-map.tsx reads the same version).
//
// The version is in the path, so an upgrade never meets a cached old worker,
// and the copies are gitignored: node_modules is the one source.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'node_modules', 'maplibre-gl', 'dist')
const { version } = JSON.parse(readFileSync(join(dist, '..', 'package.json'), 'utf8'))
const vendor = join(root, 'public', 'vendor', 'maplibre')

// The worker imports the shared chunk by relative path, so both go.
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

mkdirSync(vendor, { recursive: true })
for (const old of readdirSync(vendor, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
  if (old.name !== version) rmSync(join(vendor, old.name), { recursive: true })
}

const target = join(vendor, version)
mkdirSync(target, { recursive: true })
for (const file of FILES) copyFileSync(join(dist, file), join(target, file))
console.log(`maplibre-gl ${version}: worker disalin ke public/vendor/maplibre/${version}`)
