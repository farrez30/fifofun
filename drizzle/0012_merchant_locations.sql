-- Where each merchant is, so spending can be drawn on a map.
--
-- A bank statement carries the merchant's name and never its place. The
-- household places a merchant once, keyed the same way the review queue
-- groups rows (suggestPattern of the description), and every transaction
-- under that name follows, including next month's import. A merchant with
-- no coordinates is one the household says has no place (a shop that only
-- sells online but takes QRIS), so it stops being offered for placing.
--
-- Everything above the hand-written section is generated from
-- src/db/schema.ts; the policy, trigger and checks below have no Drizzle
-- equivalent and follow the plans table in 0006.

CREATE TABLE "merchant_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"merchant_key" text NOT NULL,
	"label" text NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchant_locations" ADD CONSTRAINT "merchant_locations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_locations_unique" ON "merchant_locations" USING btree ("household_id","merchant_key");
--> statement-breakpoint
-- Hand written from here.
alter table public.merchant_locations enable row level security;
--> statement-breakpoint
create policy merchant_locations_member_access on public.merchant_locations
  for all to authenticated
  using (household_id in (select public.current_user_households()))
  with check (household_id in (select public.current_user_households()));
--> statement-breakpoint
create trigger merchant_locations_touch_updated_at
  before update on public.merchant_locations
  for each row execute function public.touch_updated_at();
--> statement-breakpoint
-- The form validates the same bounds; this is the last place that can refuse
-- a point no screen would ever produce.
alter table public.merchant_locations add constraint merchant_locations_bounds check (
  (lat is null) = (lng is null)
  and (lat is null or (lat between -90 and 90 and lng between -180 and 180))
  and length(merchant_key) between 3 and 120
  and length(label) between 1 and 120
  and (address is null or length(address) <= 300)
  and source in ('manual', 'osm', 'riset')
);
