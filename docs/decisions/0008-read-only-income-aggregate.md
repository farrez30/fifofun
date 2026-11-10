# 0008 — Read-only income aggregate for the schedule app

- Date: 2026-11-10
- Status: Accepted

## Context

Farrez's schedule app (jadwal-frz, ADR 0005 there) works out an hourly value:
salary and side income for a month divided by the hours that earned them. The
figures already live in this ledger. Typing them twice would drift, so the app
should read them, but the app has no signed-in user and must not get more than
it needs.

## Options considered

1. A token-gated endpoint that returns one income total per category for one
   month, the household fixed in configuration.
2. Export a CSV by hand each month and import it on the phone.
3. Give the app a database role with read access to `transactions`.

## Decision

Option 1, decided by Farrez ("Ya, lanjut FiFoFun" after the FiFoFun option was
put to him in the jadwal-frz session).

## Reasoning

The value updates without a monthly chore, and what leaves is a handful of
totals rather than rows.

## Consequences

- `GET /api/agregat/pemasukan?bulan=YYYY-MM` with `Authorization: Bearer`.
  Only the token's sha256 sits in `AGREGAT_TOKEN_SHA256`; the household is
  `AGREGAT_HOUSEHOLD_ID`, never read from the request. In-memory rate limit of
  30 a minute per address, a brake rather than a gate.
- Same rule as the reports: `cashflow = 'income'`, not deleted, not
  pass-through, Jakarta month bounds. Totals are sen as strings.
- The route runs as the database owner (`asService`), like the Telegram
  webhook, so its tests are about the gates (`route.test.ts`).
- Rotating: generate a new token, replace the hash in Vercel, paste the token in
  the app. Either env missing turns the endpoint off (401 or 503).
- Revisit if a second consumer appears (then per-client tokens and scopes) or if
  category names stop being a stable key for the app's mapping.
