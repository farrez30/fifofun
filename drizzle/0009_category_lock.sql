-- A row whose category a person decided to leave alone.
--
-- Tidying offers rows that still sit in an import default. Saying no to one of
-- those is a decision, and until now there was nowhere to put it: every row in
-- this ledger carries a confirmation stamp it never earned, so "left here on
-- purpose" and "parked here by the importer" read identically. Without this
-- column the panel would propose the same rows on every visit and never empty.
--
-- Nothing to grant or revoke: the policy on transactions is table level
-- (0001, %1$s_member_access), so a new column is covered by what is already there.

ALTER TABLE "transactions" ADD COLUMN "category_locked_at" timestamp with time zone;
