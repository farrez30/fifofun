/**
 * Just enough of the Compound File Binary format ([MS-CFB]) to pull two named
 * streams out of a password-protected workbook.
 *
 * An encrypted .xlsx is not a ZIP. Excel wraps the encrypted ZIP in the old OLE
 * container, next to a stream describing how it was encrypted, and that
 * container is what this reads. It is a FAT file system in miniature: fixed
 * size sectors, a table saying which sector follows which, and a directory of
 * named entries pointing at the first sector of each chain. Small streams live
 * in a second, finer-grained "mini" system stored inside one big stream.
 *
 * Read only, by name only. The directory is a red-black tree, but the handful
 * of entries an encrypted workbook carries are simply scanned.
 *
 * Every number in here comes out of an uploaded file, so every chain walk is
 * bounded by the number of sectors the file can actually hold: a cycle in the
 * table, or a pointer past the end, fails instead of looping or reading
 * outside the buffer.
 */

export const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

const END_OF_CHAIN = 0xfffffffe
const FREE_SECTOR = 0xffffffff
const HEADER_DIFAT_ENTRIES = 109
const DIRECTORY_ENTRY_BYTES = 128
const STREAM = 2
const ROOT = 5

export function isCompoundFile(bytes: Uint8Array): boolean {
  return CFB_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

export class CompoundFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompoundFileError'
  }
}

interface Entry {
  name: string
  type: number
  start: number
  size: number
}

export interface CompoundFile {
  /**
   * A stream's bytes, or null when there is no stream of that name.
   *
   * `align` reads past the declared size so that everything after the first
   * `skip` bytes is a whole number of `to` byte blocks, as long as the sectors
   * really hold the bytes. Some writers declare an encrypted package's exact
   * length rather than its cipher-block-padded one, and the last block cannot
   * be decrypted without the tail they left out.
   */
  stream(name: string, align?: { skip: number; to: number }): Uint8Array | null
}

export function readCompoundFile(bytes: Uint8Array): CompoundFile {
  if (bytes.length < 512 || !isCompoundFile(bytes)) {
    throw new CompoundFileError('Not a compound file')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (offset: number) => view.getUint16(offset, true)
  const u32 = (offset: number) => view.getUint32(offset, true)

  const sectorShift = u16(0x1e)
  const miniShift = u16(0x20)
  if ((sectorShift !== 9 && sectorShift !== 12) || miniShift !== 6) {
    throw new CompoundFileError(`Unsupported sector sizes 2^${sectorShift} / 2^${miniShift}`)
  }
  const sectorSize = 1 << sectorShift
  const miniSize = 1 << miniShift
  const miniCutoff = u32(0x38)
  // The header occupies the first sector's worth of space.
  const sectorCount = Math.floor((bytes.length - sectorSize) / sectorSize) + 1

  const sectorOffset = (sector: number) => {
    if (sector >= sectorCount) throw new CompoundFileError(`Sector ${sector} is past the end of the file`)
    return (sector + 1) * sectorSize
  }

  // The DIFAT lists the sectors that make up the FAT: 109 in the header, the
  // rest in a chain of DIFAT sectors whose last slot points at the next one.
  const fatSectors: number[] = []
  for (let i = 0; i < HEADER_DIFAT_ENTRIES; i++) {
    const sector = u32(0x4c + i * 4)
    if (sector !== FREE_SECTOR) fatSectors.push(sector)
  }
  const perSector = sectorSize / 4
  let difat = u32(0x44)
  for (let hops = 0; difat !== END_OF_CHAIN && difat !== FREE_SECTOR; hops++) {
    if (hops > sectorCount) throw new CompoundFileError('DIFAT chain loops')
    const base = sectorOffset(difat)
    for (let i = 0; i < perSector - 1; i++) {
      const sector = u32(base + i * 4)
      if (sector !== FREE_SECTOR) fatSectors.push(sector)
    }
    difat = u32(base + (perSector - 1) * 4)
  }

  const fat: number[] = []
  for (const sector of fatSectors) {
    const base = sectorOffset(sector)
    for (let i = 0; i < perSector; i++) fat.push(u32(base + i * 4))
  }

  function chain(start: number, table: number[], limit: number): number[] {
    const sectors: number[] = []
    for (let sector = start; sector !== END_OF_CHAIN; sector = table[sector]) {
      if (sector === undefined || sector >= table.length || sectors.length > limit) {
        throw new CompoundFileError('Sector chain is broken or loops')
      }
      sectors.push(sector)
    }
    return sectors
  }

  function readChain(start: number): Uint8Array {
    const sectors = chain(start, fat, sectorCount)
    const out = new Uint8Array(sectors.length * sectorSize)
    sectors.forEach((sector, index) => {
      const base = sectorOffset(sector)
      out.set(bytes.subarray(base, base + sectorSize), index * sectorSize)
    })
    return out
  }

  const directory = readChain(u32(0x30))
  const entries: Entry[] = []
  const dirView = new DataView(directory.buffer, directory.byteOffset, directory.byteLength)
  for (let offset = 0; offset + DIRECTORY_ENTRY_BYTES <= directory.length; offset += DIRECTORY_ENTRY_BYTES) {
    const type = directory[offset + 0x42]
    if (type === 0) continue
    const nameBytes = Math.min(dirView.getUint16(offset + 0x40, true), 64)
    const name = new TextDecoder('utf-16le').decode(directory.subarray(offset, offset + Math.max(nameBytes - 2, 0)))
    // The high half of the size is only meaningful in version 4 files, and no
    // stream this code wants comes anywhere near four gigabytes.
    entries.push({ name, type, start: dirView.getUint32(offset + 0x74, true), size: dirView.getUint32(offset + 0x78, true) })
  }

  const root = entries.find((entry) => entry.type === ROOT)
  let mini: { fat: number[]; stream: Uint8Array } | null = null
  const miniSystem = () => {
    if (mini) return mini
    if (!root) throw new CompoundFileError('No root entry')
    const miniFat: number[] = []
    const miniFatStart = u32(0x3c)
    if (miniFatStart !== END_OF_CHAIN) {
      const table = readChain(miniFatStart)
      const tableView = new DataView(table.buffer)
      for (let i = 0; i + 4 <= table.length; i += 4) miniFat.push(tableView.getUint32(i, true))
    }
    mini = { fat: miniFat, stream: readChain(root.start) }
    return mini
  }

  return {
    stream(name, align = { skip: 0, to: 1 }) {
      const entry = entries.find((candidate) => candidate.type === STREAM && candidate.name === name)
      if (!entry) return null
      const tail = Math.max(entry.size - align.skip, 0)
      const wanted = align.skip + Math.ceil(tail / align.to) * align.to

      if (entry.size < miniCutoff) {
        const { fat: miniFat, stream } = miniSystem()
        const sectors = chain(entry.start, miniFat, stream.length / miniSize)
        const out = new Uint8Array(sectors.length * miniSize)
        sectors.forEach((sector, index) => {
          const base = sector * miniSize
          if (base + miniSize > stream.length) throw new CompoundFileError('Mini sector is past the mini stream')
          out.set(stream.subarray(base, base + miniSize), index * miniSize)
        })
        return out.subarray(0, Math.min(wanted, out.length))
      }

      const data = readChain(entry.start)
      if (data.length < entry.size) throw new CompoundFileError(`Stream ${name} is shorter than declared`)
      return data.subarray(0, Math.min(wanted, data.length))
    },
  }
}
