import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Only --env-saja is exercised. The other mode talks to Neon production, and a
// test must never be one PATH mistake away from doing that.
const SCRIPT = join(__dirname, 'siapkan-cadangan.sh')
const HOST = 'ep-uji-123.ap-southeast-1.aws.neon.tech'

const CODEROACH_ENV = [
  '# Konfigurasi pekerja backup Neon produksi',
  'SUMBER=url',
  'PGB=/usr/lib/postgresql/18/bin',
  "DB_URLS='coderoach=postgresql://cadangan@ep-coderoach.neon.tech/neondb?sslmode=require'",
  'PGPASSFILE=/rahasia/pgpass',
  'BASIS=/var/backups/pg',
  "RESTIC_REPOSITORY='s3:https://s3.example/bucket/neon'",
  'RESTIC_PASSWORD_FILE=/rahasia/restic.pw',
  "AWS_ACCESS_KEY_ID='kunci'",
  'RESTIC_HOST=coderoach-neon-pekerja',
  'RESTIC_TAG=neon',
  "HC_URL='https://hc-ping.com/coderoach-backup'",
  "HC_URL_PULIH='https://hc-ping.com/coderoach-pulih'",
  '',
].join('\n')

let dir: string

function run(args: string[], extraPath?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, CADANGAN_FOLDER: dir }
  if (extraPath) env.PATH = `${extraPath}${delimiter}${env.PATH}`
  return spawnSync('bash', [SCRIPT, ...args], { env, encoding: 'utf8' })
}

function base(content: string) {
  writeFileSync(join(dir, 'rahasia', 'backup.env'), content)
}

function out() {
  return readFileSync(join(dir, 'rahasia', 'backup-fifofun.env'), 'utf8')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cadangan-'))
  mkdirSync(join(dir, 'rahasia'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('siapkan-cadangan.sh --env-saja', () => {
  it('writes each FiFoFun variable exactly once, pointing at FiFoFun only', () => {
    base(CODEROACH_ENV)
    const r = run(['--env-saja', HOST])
    expect(r.status, r.stderr).toBe(0)

    const env = out()
    for (const name of ['DB_URLS', 'BASIS', 'CATATAN_PULIH', 'RESTIC_TAG', 'RESTIC_HOST', 'HC_URL', 'HC_URL_PULIH', 'PULIH_PRA_SQL']) {
      expect(env.match(new RegExp(`^${name}=`, 'gm'))).toHaveLength(1)
    }
    expect(env).toContain(`DB_URLS='fifofun=postgresql://cadangan@${HOST}/neondb?sslmode=require'`)
    expect(env).toContain('BASIS=/var/backups/pg/fifofun')
    expect(env).toContain('CATATAN_PULIH=/var/backups/pg/fifofun/uji-pulih.tsv')
    expect(env).toContain('RESTIC_TAG=fifofun-neon')
    expect(env).not.toContain('coderoach=')
  })

  it('never inherits the Coderoach health checks', () => {
    base(CODEROACH_ENV)
    run(['--env-saja', HOST])
    const env = out()
    expect(env).toMatch(/^HC_URL=''$/m)
    expect(env).toMatch(/^HC_URL_PULIH=''$/m)
    expect(env).not.toContain('hc-ping.com/coderoach')
  })

  it('creates the app roles before the restore test, since the policies name them', () => {
    base(CODEROACH_ENV)
    run(['--env-saja', HOST])
    const line = out().match(/^PULIH_PRA_SQL='(.*)'$/m)?.[1] ?? ''
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect(line).toContain(`create role ${role} nologin;`)
    }
  })

  it('does not inherit a restore hook meant for another set', () => {
    base(`${CODEROACH_ENV}PULIH_PRA_SQL='drop schema public cascade;'\n`)
    run(['--env-saja', HOST])
    expect(out()).not.toContain('drop schema')
  })

  it('keeps the shared repository, keys and host so retention groups correctly', () => {
    base(CODEROACH_ENV)
    run(['--env-saja', HOST])
    const env = out()
    expect(env).toContain("RESTIC_REPOSITORY='s3:https://s3.example/bucket/neon'")
    expect(env).toContain('RESTIC_PASSWORD_FILE=/rahasia/restic.pw')
    expect(env).toContain("AWS_ACCESS_KEY_ID='kunci'")
    expect(env).toContain('PGPASSFILE=/rahasia/pgpass')
    expect(env).toMatch(/^RESTIC_HOST=coderoach-neon-pekerja$/m)
  })

  it('reads RESTIC_HOST from a backup.env saved with CRLF line endings', () => {
    base(CODEROACH_ENV.replace(/\n/g, '\r\n'))
    const r = run(['--env-saja', HOST])
    expect(r.status, r.stderr).toBe(0)
    expect(out()).toMatch(/^RESTIC_HOST=coderoach-neon-pekerja$/m)
  })

  it('leaves backup.env untouched', () => {
    base(CODEROACH_ENV)
    run(['--env-saja', HOST])
    expect(readFileSync(join(dir, 'rahasia', 'backup.env'), 'utf8')).toBe(CODEROACH_ENV)
  })

  it('refuses when backup.env has no RESTIC_HOST, writing nothing', () => {
    base(CODEROACH_ENV.replace(/^RESTIC_HOST=.*\n/m, ''))
    const r = run(['--env-saja', HOST])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('RESTIC_HOST')
    expect(existsSync(join(dir, 'rahasia', 'backup-fifofun.env'))).toBe(false)
  })

  it('warns when backup.env still holds template placeholders', () => {
    base(CODEROACH_ENV.replace("'kunci'", "'<keyID Application Key B2>'"))
    const r = run(['--env-saja', HOST])
    expect(r.status).toBe(0)
    expect(r.stderr).toContain('bertemplat')
  })

  it('warns when backup.env still lists fifofun in the Coderoach set', () => {
    base(CODEROACH_ENV.replace("sslmode=require'", `sslmode=require fifofun=postgresql://cadangan@${HOST}/neondb'`))
    const r = run(['--env-saja', HOST])
    expect(r.stderr).toContain('entri fifofun')
  })

  it('asks for a host instead of guessing one', () => {
    base(CODEROACH_ENV)
    const r = run(['--env-saja'])
    expect(r.status).toBe(2)
  })

  it('does not call Neon or psql', () => {
    base(CODEROACH_ENV)
    const stubs = join(dir, 'stubs')
    const marker = join(dir, 'dipanggil')
    mkdirSync(stubs)
    for (const name of ['npx', 'psql', 'neonctl']) {
      const file = join(stubs, name)
      writeFileSync(file, `#!/usr/bin/env bash\ntouch "${marker.replace(/\\/g, '/')}"\nexit 1\n`)
      chmodSync(file, 0o755)
    }
    const r = run(['--env-saja', HOST], stubs)
    expect(r.status, r.stderr).toBe(0)
    expect(existsSync(marker)).toBe(false)
  })
})
