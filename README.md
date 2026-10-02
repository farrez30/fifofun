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

**Records what the bank cannot see.** Cash, e-wallets and corrections are typed
in on their own page, and a manual entry that turns out to be the same
transaction the next statement brings in is detected and offered as a merge
rather than counted twice. Where a wallet balance has drifted, the difference is
recorded as an adjustment transaction, so the money that went missing shows up
as spending instead of quietly vanishing from a balance.

**Lets a decision be revisited.** Any transaction can be recategorised, noted,
split into several categories, or removed, from wherever it was seen. What the
bank said about a row is not editable: the amount, the date and the accounts of
a statement line are what the reconciliation checks itself against. One receipt
covering four categories is therefore split rather than edited, into parts that
add up to the original exactly.

**Plans forward.** Budget allocation frameworks used in Indonesia, financial
health ratios with their published thresholds, cost projections for children and
education under Indonesian education inflation, and gap analysis between the
life you budget for and the one you want. The answers are saved, so the planner
is a plan rather than a demonstration.

**Sets the budget it judges you against.** Budgets are decided per category per
month, next to the median of the months before it and to what was budgeted last
month, so a first figure is chosen with the evidence in front of it. Savings
pots work from either end: a deadline gives the monthly figure it needs, and a
monthly figure gives the month it arrives.

**Knows when a bill is late.** A recurring bill is a category of its own, and
can carry what it costs and the day of the month it falls due. Whether it was
paid is still read from the ledger, never ticked by hand; the stated amount
replaces the median of past payments, and the due day lets an unpaid bill say
how many days late it is instead of waiting for the month to end. Ending a bill
archives it, so the months it was paid keep their totals.

**Shows three months on one screen for somebody else.** `/ringkasan` puts the
last three finished months side by side with their average: income, spending
in seven groups plus what went into e-wallets and cash, what was left, every savings pot (empty ones included), and a
few lines of the household's own plan. It is meant to be read off a phone across
a table, so it holds aggregates only and no advice, and "Bagikan sebagai PDF"
renders the same figures on the server as a one-page A4 file. Which income
counts, which money only pays back spending (family covering a bill, a friend's
share of a subscription), and how categories group are
one config, printed on the page as footnotes. Payments made from an e-wallet or
cash are rarely itemised, so a top-up counts as spent the month it went in,
less anything that was recorded coming out of the wallet.

**Shows where the money went.** A bank statement names a merchant and never a
place, so a merchant is placed once, by searching OpenStreetMap or clicking on
the map, and every payment made at its counter follows, including next month's
import. The map weighs places by money, by visits, or by what one visit costs,
filtered by category and month, with a table of the same figures beside it.
Each dot takes the colour of its category group, and a legend of the groups
switches them on and off on the map without reloading.
Online orders, transfers and cashier software that hides the outlet's name are
counted honestly as having no place rather than pinned wherever the payment
company is registered. They get their own answer beside the map instead: who
was paid online and in which country that company bills from, so the share of
money leaving the country is a number rather than a guess. A merchant can be
in different places over time: electricity tokens bought for one house and
later for another become two dated points, since the statement never names
the meter. The search runs on
the server and sends only the merchant's name; the tiles come from OpenFreeMap.

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

A balance correction ("the wallet really held Rp41.148 on 23 August") is kept
as a claim, not as a frozen difference. When a later import adds rows dated
before it, the dashboard says which corrections no longer land on their claim
and recomputes them in one step, instead of letting a wallet drift negative.

## Status

In daily use against a real household ledger. The domain layer and the
application on top of it are both complete: import, review, manual entry,
reporting, budgets, savings goals, the planner, and the settings that let
accounts and categories be renamed without breaking the import.

Every component is also rendered standalone into a fixture page and checked with
axe in both colour schemes, and against horizontal overflow at 375px, because a
chart that reconciles perfectly and cannot be read on a phone is still broken.

```bash
pnpm install
pnpm test             # unit
pnpm test:e2e         # components in a real browser, plus the accessibility sweep
pnpm test:e2e:mobile  # the same fixtures at 390px, with a finger instead of a mouse
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
