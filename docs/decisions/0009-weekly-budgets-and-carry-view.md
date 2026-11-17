# 0009 — Weekly budgets, and leftovers worked out on screen

- Date: 2026-11-17
- Status: Accepted

## Context

Budgets were monthly only (`budgets`, one row per category per month). After
comparing a weekly dating budget in the couple app (FarShin), Farrez wanted the
same picture in FiFoFun: per category, what each period was allowed, what it
got after the previous period's leftover, and what it spent, plus a side by
side of what to do with a leftover (carry it, save it, let it lapse).

## Options considered

Period: monthly only; monthly plus weeks prorated from the month; or weekly
budgets of their own (new schema) alongside the monthly ones.

Leftover: computed on screen with the policy picked in the UI; a stored policy
per category that changes the effective budget on every screen; or a stored
ledger of closed leftovers per period.

Weekly storage: a figure in force from a Monday until replaced; one row per
week; or one column on `categories`.

Placement: under the year strip on `/anggaran`; its own route; the dashboard.

## Decision

Decided by Farrez:

- Both periods. Monthly reads `budgets`; weekly reads a new `weekly_budgets`
  table (migration 0017).
- A weekly row is a standing figure from its Monday (`ongoing = true`) or an
  exception for that week only (`ongoing = false`). Weeks are Monday to Sunday,
  Jakarta time.
- The leftover is never stored. `src/lib/ledger/carry.ts` runs all three
  policies from the same figures; the toggle picks which one is drawn.
- The chart lives on `/anggaran`, under "Setahun ke belakang".

## Reasoning

In Farrez's words: weekly "opsi satu tapi bisa beda juga", and "maksud saya
juga bulanan juga bisa". For computing on screen under the year strip: "Saya
mau lihat dulu polanya tanpa mengubah angka di layar lain, dan dekat dengan
tempat saya menetapkan anggaran."

## Consequences

- No other screen changes: the budget table, the allocation bar and the
  dashboard still judge against the base budget.
- The carry chain starts at the first budgeted period in the twelve shown; a
  period without a budget breaks it. Older history does not feed in.
- The choices live in the address (`kategori`, `per`, `sisa`), so a link
  reopens the same view.

Revisit if a policy is picked and lived by for a while (then store it per
category so other screens can use the effective budget), or if the weekly
window needs more than twelve weeks.
