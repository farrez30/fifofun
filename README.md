# FiFoFun

Personal financial planner for Indonesia, built around a simple idea: a budget
app is only trustworthy if its numbers can be checked against something.

Here the check is your bank statement. FiFoFun imports the `.xlsx` e-Statement
that Livin' by Mandiri exports, reconciles every row against the balances the
bank itself printed, and uses that as the reference your own bookkeeping is
measured against.

## Why it exists

Spreadsheet budgeting breaks in two places. Entries drift without anyone
noticing, and the sheet can only tell you about the past.

Both are real. In the data this project was built from, a Rp4,7 million shopping
transaction had been filed under a category budgeted at Rp80.500, so that
category read 5964% of budget for the month. An e-wallet balance sat at minus
Rp47.200 for four weeks. Neither was caught, because nothing was checking.

## What it does

**Imports and verifies.** The Mandiri parser reads the workbook, then runs four
independent reconciliation checks. The strongest walks the running balance row
by row, so a parsing error points at the exact transaction rather than reporting
that a total is off by some amount.

**Understands the transactions.** Bank descriptions are classified into
transaction kind, counterparty, and direction, including the distinctions that
quietly corrupt budgets:

- Topping up your own e-wallet is not spending; it is your money moving.
- Money arriving back from an e-wallet is not income.
- Money that arrives and leaves the same day is somebody else's, passing through.

**Plans forward.** Budget allocation frameworks used in Indonesia, financial
health ratios with their published thresholds, cost projections for children and
education under Indonesian education inflation, and gap analysis between the
life you budget for and the one you want.

## Correctness

Money is stored as `bigint` in sen. Never floats. Statement reconciliation
asserts exact equality, and floating point drift would break it.

Every number the planner shows is derived from a tested function, and every
domain constant carries its source. The monthly cashflow formula was derived
from the source spreadsheet and verified against three months of real figures
before any of it was written; those three numbers are asserted in the test suite
as acceptance criteria.

The parser and classifier were developed against 23 real monthly statements
covering 1,591 transactions. All 23 reconcile exactly, and all 1,591 classify
with no unrecognised rows and no disagreement with the bank's own debit and
credit columns.

## Status

Under active development. The domain layer is complete and tested; the
application is being built on top of it.

```bash
pnpm install
pnpm test
```

## Deployment

Vercel, with the functions pinned to the same region as the Supabase project so
a server-rendered page is not paying for a round trip across an ocean per query.
The runbook, including which environment variable belongs where and why
`DATABASE_URL` deliberately does not belong on the platform, is in
[docs/deploy.md](docs/deploy.md).

## Privacy

No financial data lives in this repository, and none ever will. Statements are
read from a local directory that is git-ignored, and the test fixtures reproduce
the shape of real statements using invented names and account numbers.

## Licence

MIT
