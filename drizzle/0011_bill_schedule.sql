-- What a recurring bill costs and when it is due.
--
-- Until now a bill was only a category with cashflow `bills`, and the
-- dashboard guessed its amount from the median of past payments. That guess
-- has nothing to say about a bill set up this month, and nothing at all about
-- when it falls due, which is the one thing the spreadsheet's Setup sheet was
-- there to remember.
--
-- Two nullable columns on categories rather than a table of their own: one
-- bill is one category here, the same way one pot is one category with its
-- target beside it (0003). Nothing to grant or revoke, the policy on
-- categories is table level (0001).

ALTER TABLE "categories" ADD COLUMN "bill_amount" bigint;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "bill_due_day" smallint;
--> statement-breakpoint
-- Hand written from here: checks have no Drizzle equivalent.
alter table public.categories add constraint categories_bill_amount_positive
  check (bill_amount is null or bill_amount > 0);
--> statement-breakpoint
alter table public.categories add constraint categories_bill_due_day_range
  check (bill_due_day is null or bill_due_day between 1 and 31);
--> statement-breakpoint
-- Only a bill has a schedule. A spending category with a due date would be
-- asked about on the dashboard by nothing and filtered out by everything.
alter table public.categories add constraint categories_bill_schedule_only_bills
  check (cashflow = 'bills' or (bill_amount is null and bill_due_day is null));
