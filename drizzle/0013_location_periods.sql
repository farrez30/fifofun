-- A merchant can be in different places over time.
--
-- The same "PLN Iconpay" bought electricity for one house until late 2025 and
-- for a boarding house from June 2026, and the statement never says which
-- meter. A location now carries the days it is right for; both null means
-- always. The unique key moves from (household, merchant) to (household,
-- merchant, valid_from) with NULLS NOT DISTINCT, so a merchant still has at
-- most one open-ended point. Overlapping periods are refused by the action.
--
-- Everything above the hand-written section is generated from
-- src/db/schema.ts.

DROP INDEX "merchant_locations_unique";--> statement-breakpoint
ALTER TABLE "merchant_locations" ADD COLUMN "valid_from" date;--> statement-breakpoint
ALTER TABLE "merchant_locations" ADD COLUMN "valid_to" date;--> statement-breakpoint
ALTER TABLE "merchant_locations" ADD CONSTRAINT "merchant_locations_unique" UNIQUE NULLS NOT DISTINCT("household_id","merchant_key","valid_from");
--> statement-breakpoint
-- Hand written from here.
alter table public.merchant_locations add constraint merchant_locations_period check (
  valid_from is null or valid_to is null or valid_from <= valid_to
);
