import { createDecipheriv, createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import { isCompoundFile, readCompoundFile } from './cfb'

/**
 * Opening a password-protected .xlsx: ECMA-376 Agile Encryption, the scheme
 * every Excel since 2010 writes and the one Mandiri's e-Statements arrived in
 * from August 2026.
 *
 * The password turns into a key through a salted hash iterated some hundred
 * thousand times. That key unlocks a random secret key stored in the file, and
 * the secret key decrypts the real workbook in 4096 byte segments. A pair of
 * encrypted verifier values says whether the password was right before any of
 * the workbook is touched.
 *
 * The password is only ever a function argument here. It is never logged,
 * never stored, and never part of an error message: every error below is
 * written without it, because `importStatement` logs what it catches.
 *
 * The file's HMAC over the package is not checked. The verifier already
 * proves the password, and a package damaged in transit fails the ZIP reader
 * or the balance reconciliation afterwards, both of which say so.
 */

export class WrongPasswordError extends Error {
  constructor() {
    super('The password does not open this workbook')
    this.name = 'WrongPasswordError'
  }
}

export class UnsupportedWorkbookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedWorkbookError'
  }
}

/** An OLE container. Either an encrypted .xlsx or a legacy .xls. */
export { isCompoundFile }

/** Whether this OLE container holds an encrypted OOXML package. */
export function isEncryptedWorkbook(bytes: Uint8Array): boolean {
  if (!isCompoundFile(bytes)) return false
  try {
    const file = readCompoundFile(bytes)
    return file.stream('EncryptionInfo') !== null && file.stream('EncryptedPackage') !== null
  } catch {
    return false
  }
}

/*
  Excel writes 100 000. [MS-OFFCRYPTO] allows up to ten million, and a file is
  free to ask for that, at a few seconds of server CPU per attempt. Anything
  past what Excel actually produces is refused rather than paid for.
*/
const MAX_SPIN_COUNT = 1_000_000

/** Same ceiling the ZIP reader puts on one decompressed part. */
const MAX_PACKAGE_BYTES = 32 * 1024 * 1024

const SEGMENT_BYTES = 4096

const BLOCK_VERIFIER_INPUT = Buffer.from([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79])
const BLOCK_VERIFIER_VALUE = Buffer.from([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e])
const BLOCK_SECRET_KEY = Buffer.from([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6])

const HASHES: Record<string, string> = { SHA1: 'sha1', SHA256: 'sha256', SHA384: 'sha384', SHA512: 'sha512' }

export interface CipherParams {
  hash: string
  keyBits: number
  blockSize: number
  salt: Buffer
}

export interface AgileInfo {
  keyData: CipherParams
  password: CipherParams & {
    spinCount: number
    encryptedVerifierHashInput: Buffer
    encryptedVerifierHashValue: Buffer
    encryptedKeyValue: Buffer
  }
}

function cipherParams(node: Record<string, string>): CipherParams {
  const hash = HASHES[node.hashAlgorithm]
  const keyBits = Number(node.keyBits)
  const blockSize = Number(node.blockSize)
  if (!hash) throw new UnsupportedWorkbookError(`Hash ${node.hashAlgorithm} is not supported`)
  if (node.cipherAlgorithm !== 'AES' || node.cipherChaining !== 'ChainingModeCBC') {
    throw new UnsupportedWorkbookError(`Cipher ${node.cipherAlgorithm}/${node.cipherChaining} is not supported`)
  }
  if (![128, 192, 256].includes(keyBits) || blockSize !== 16) {
    throw new UnsupportedWorkbookError(`AES with ${keyBits} bit keys and ${blockSize} byte blocks is not supported`)
  }
  return { hash, keyBits, blockSize, salt: Buffer.from(node.saltValue ?? '', 'base64') }
}

/** The encryption description, checked against what this code can open safely. */
export function parseAgileInfo(stream: Uint8Array): AgileInfo {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength)
  const major = view.getUint16(0, true)
  const minor = view.getUint16(2, true)
  if (major !== 4 || minor !== 4) {
    // 3.2 and 4.2 are Standard Encryption, from Excel 2007. Nothing current
    // writes it, and a bank certainly does not.
    throw new UnsupportedWorkbookError(`Encryption version ${major}.${minor} is not Agile`)
  }

  const xml = new TextDecoder().decode(stream.subarray(8))
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true }).parse(xml)
  const encryption = parsed?.encryption
  const encryptors = [encryption?.keyEncryptors?.keyEncryptor ?? []].flat()
  const passwordKey = encryptors.find(
    (encryptor: Record<string, unknown>) =>
      encryptor?.uri === 'http://schemas.microsoft.com/office/2006/keyEncryptor/password',
  )?.encryptedKey
  if (!encryption?.keyData || !passwordKey) {
    throw new UnsupportedWorkbookError('The workbook is not protected by a password')
  }

  const spinCount = Number(passwordKey.spinCount)
  if (!Number.isInteger(spinCount) || spinCount < 0 || spinCount > MAX_SPIN_COUNT) {
    throw new UnsupportedWorkbookError(`Spin count ${passwordKey.spinCount} is outside what Excel writes`)
  }

  return {
    keyData: cipherParams(encryption.keyData),
    password: {
      ...cipherParams(passwordKey),
      spinCount,
      encryptedVerifierHashInput: Buffer.from(passwordKey.encryptedVerifierHashInput ?? '', 'base64'),
      encryptedVerifierHashValue: Buffer.from(passwordKey.encryptedVerifierHashValue ?? '', 'base64'),
      encryptedKeyValue: Buffer.from(passwordKey.encryptedKeyValue ?? '', 'base64'),
    },
  }
}

function digest(algorithm: string, ...parts: Buffer[]): Buffer {
  const hash = createHash(algorithm)
  for (const part of parts) hash.update(part)
  return hash.digest()
}

/** Truncated, or padded with 0x36, to the length asked for. The spec's own rule. */
function fit(bytes: Buffer, length: number): Buffer {
  const out = Buffer.alloc(length, 0x36)
  bytes.copy(out, 0, 0, Math.min(bytes.length, length))
  return out
}

function decrypt(keyBits: number, key: Buffer, iv: Buffer, data: Buffer): Buffer {
  if (data.length % 16 !== 0) throw new UnsupportedWorkbookError('Encrypted data is not whole cipher blocks')
  const decipher = createDecipheriv(`aes-${keyBits}-cbc`, key, iv)
  decipher.setAutoPadding(false)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

/** The workbook's secret key, or a WrongPasswordError. */
function secretKey(info: AgileInfo, password: string): Buffer {
  const p = info.password
  let hash = digest(p.hash, p.salt, Buffer.from(password, 'utf16le'))
  const counter = Buffer.alloc(4)
  for (let i = 0; i < p.spinCount; i++) {
    counter.writeUInt32LE(i)
    hash = digest(p.hash, counter, hash)
  }
  const keyFor = (block: Buffer) => fit(digest(p.hash, hash, block), p.keyBits / 8)

  const verifierInput = decrypt(p.keyBits, keyFor(BLOCK_VERIFIER_INPUT), p.salt, p.encryptedVerifierHashInput)
  const verifierHash = decrypt(p.keyBits, keyFor(BLOCK_VERIFIER_VALUE), p.salt, p.encryptedVerifierHashValue)
  const expected = digest(p.hash, verifierInput.subarray(0, p.salt.length))
  if (!expected.equals(verifierHash.subarray(0, expected.length))) throw new WrongPasswordError()

  const key = decrypt(p.keyBits, keyFor(BLOCK_SECRET_KEY), p.salt, p.encryptedKeyValue)
  return key.subarray(0, info.keyData.keyBits / 8)
}

/**
 * The plain .xlsx inside a password-protected one.
 *
 * Throws WrongPasswordError for a password that does not open it, and
 * UnsupportedWorkbookError for anything this cannot or will not open.
 */
export function decryptWorkbook(bytes: Uint8Array, password: string): Uint8Array {
  const file = readCompoundFile(bytes)
  const infoStream = file.stream('EncryptionInfo')
  if (!infoStream) throw new UnsupportedWorkbookError('No EncryptionInfo stream')
  const info = parseAgileInfo(infoStream)

  const packageStream = file.stream('EncryptedPackage', { skip: 8, to: 16 })
  if (!packageStream || packageStream.length < 8) throw new UnsupportedWorkbookError('No EncryptedPackage stream')

  const pkg = Buffer.from(packageStream.buffer, packageStream.byteOffset, packageStream.byteLength)
  const size = pkg.readBigUInt64LE(0)
  if (size > BigInt(MAX_PACKAGE_BYTES)) throw new UnsupportedWorkbookError(`Package declares ${size} bytes`)

  const key = secretKey(info, password)
  const { keyData } = info
  const body = pkg.subarray(8)
  const counter = Buffer.alloc(4)
  const segments: Buffer[] = []
  for (let offset = 0, index = 0; offset < body.length; offset += SEGMENT_BYTES, index++) {
    counter.writeUInt32LE(index)
    const iv = fit(digest(keyData.hash, keyData.salt, counter), keyData.blockSize)
    segments.push(decrypt(keyData.keyBits, key, iv, body.subarray(offset, offset + SEGMENT_BYTES)))
  }

  const plain = Buffer.concat(segments).subarray(0, Number(size))
  if (plain.length !== Number(size)) throw new UnsupportedWorkbookError('Package is shorter than it declares')
  return new Uint8Array(plain.buffer, plain.byteOffset, plain.byteLength)
}
