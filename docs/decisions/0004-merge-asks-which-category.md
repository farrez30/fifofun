# 0004 — Merging a duplicate asks which category stays

- Date: 2026-10-12
- Status: Accepted

## Context
A manual entry the statement later brings in is paired with the bank row and
merged from Tinjau. Merging kept the bank row's category whenever that row was
already settled, and on a fresh import a row is settled exactly when an import
rule filed it. The October 2026 statement showed what that costs: of 33 pairs,
4 lost the category the owner had typed for that one payment to a general
rule — two Indomaret snack runs filed as groceries, a sister's repayment sent
through their mother as family income, and a bonus the owner had decided was a
loan repaid counted as income (Rp3,48 jt of income that was not).

## Options considered
1. The manual category always wins over one an import rule wrote.
2. The rule keeps winning; the owner fixes such rows by hand afterwards.
3. Ask per pair: show both categories and let the owner pick.

## Decision
Option 3, decided by: the owner, choosing "Tanya per pasangan".

## Reasoning (owner's choice)
Both sides are decisions, the rule a habit and the entry a judgement about one
payment, and which one fits is the owner's to say for each pair.

## Consequences
- `needsCategoryChoice` decides when to ask: both categories set, different,
  the bank row settled, and the manual category able to sit on its sides.
- The card shows the two categories with neither picked; Gabungkan will not
  submit until one is chosen. `mergeDuplicate` refuses such a pair without a
  choice too, so no path picks a side silently. `planMerge` takes `keep`.
- An unsettled bank row (the importer's guess) still simply takes the manual
  category, as before; those pairs do not ask.

## Revisit if
Most pairs that ask end up answered the same way, which would mean one side
should win by default and the question is noise.
