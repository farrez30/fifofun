import { describe, expect, it } from 'vitest'
import { readCompoundFile } from './cfb'
import {
  UnsupportedWorkbookError,
  WrongPasswordError,
  decryptWorkbook,
  isEncryptedWorkbook,
  parseAgileInfo,
} from './encrypted'
import { ENCRYPTED_WORKBOOK, ENCRYPTED_WORKBOOK_PASSWORD } from './fixtures/encrypted-workbook'
import { cellAt, readXlsx } from './index'

/**
 * `fixtures/encrypted-workbook.ts` is a synthetic workbook, no bank data in
 * it, encrypted with the password `rahasia-uji` by msoffcrypto-tool, an
 * implementation independent of this one. A reader that only ever opened files
 * from its own writer would prove nothing about the ones a bank sends.
 *
 * The package is deliberately over 4096 bytes, as a real statement is. That
 * writer mangles a package small enough to land in the mini stream, and
 * cannot read its own output back; `EncryptionInfo` still lives in the mini
 * stream here, so both kinds of sector chain are exercised.
 */

const FIXTURE = new Uint8Array(ENCRYPTED_WORKBOOK)
const PASSWORD = ENCRYPTED_WORKBOOK_PASSWORD

describe('isEncryptedWorkbook', () => {
  it('recognises the OLE container with an encrypted package inside', () => {
    expect(isEncryptedWorkbook(FIXTURE)).toBe(true)
  })

  it('does not mistake a plain .xlsx, or garbage, for one', () => {
    expect(isEncryptedWorkbook(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false)
    const lookalike = new Uint8Array(1024)
    lookalike.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    expect(isEncryptedWorkbook(lookalike)).toBe(false)
  })
})

describe('decryptWorkbook', () => {
  it('opens the workbook with the right password', () => {
    const plain = decryptWorkbook(FIXTURE, PASSWORD)

    expect([...plain.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    const sheet = readXlsx(plain)
    expect(cellAt(sheet, 0, 0).text).toBe('Rekening Uji')
    expect(cellAt(sheet, 0, 1).text).toBe('1552574.5')
    // Spans several 4096 byte segments, so the per-segment IV is exercised.
    expect(sheet.rows.length).toBe(799)
  })

  it('refuses a wrong password before touching the workbook', () => {
    expect(() => decryptWorkbook(FIXTURE, 'salah')).toThrow(WrongPasswordError)
    expect(() => decryptWorkbook(FIXTURE, '')).toThrow(WrongPasswordError)
  })

  it('never puts the password into an error message', () => {
    const secret = 'kata-sandi-yang-tidak-boleh-bocor'
    try {
      decryptWorkbook(FIXTURE, secret)
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(secret)
      expect(String((error as Error).stack)).not.toContain(secret)
    }
  })

  it('fails cleanly on a truncated file rather than reading past it', () => {
    expect(() => decryptWorkbook(FIXTURE.subarray(0, 1536), PASSWORD)).toThrow()
  })
})

describe('parseAgileInfo', () => {
  const info = readCompoundFile(FIXTURE).stream('EncryptionInfo')!

  function withXml(transform: (xml: string) => string): Uint8Array {
    const xml = transform(new TextDecoder().decode(info.subarray(8)))
    const encoded = new TextEncoder().encode(xml)
    const out = new Uint8Array(8 + encoded.length)
    out.set(info.subarray(0, 8))
    out.set(encoded, 8)
    return out
  }

  it('reads what the fixture was written with', () => {
    const parsed = parseAgileInfo(info)
    expect(parsed.password.spinCount).toBe(100_000)
    expect(parsed.keyData.hash).toBe('sha512')
  })

  it('refuses a spin count that would tie up the server', () => {
    const greedy = withXml((xml) => xml.replace('spinCount="100000"', 'spinCount="10000000"'))
    expect(() => parseAgileInfo(greedy)).toThrow(UnsupportedWorkbookError)
  })

  it('refuses a cipher it does not implement', () => {
    const des = withXml((xml) => xml.replaceAll('cipherAlgorithm="AES"', 'cipherAlgorithm="DES"'))
    expect(() => parseAgileInfo(des)).toThrow(UnsupportedWorkbookError)
  })

  it('refuses Standard Encryption from Excel 2007', () => {
    const standard = new Uint8Array(info)
    standard.set([3, 0, 2, 0], 0)
    expect(() => parseAgileInfo(standard)).toThrow(UnsupportedWorkbookError)
  })
})
