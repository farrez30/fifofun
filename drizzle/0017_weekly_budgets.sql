-- A budget per week, for the categories lived by the week (Dating, Jajan).
--
-- A row is a standing figure from its Monday until a later standing row
-- replaces it, or (ongoing = false) an exception for that one week. A month
-- budget stays in `budgets`; the two answer different questions and a
-- household may keep both for one category. The leftover is never stored:
-- what happens to it is worked out on screen (src/lib/ledger/carry.ts).
--
-- Everything above the hand-written section is generated from
-- src/db/schema.ts; the policy, trigger, grant and checks follow 0012/0014.

CREATE TABLE "weekly_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"amount" bigint NOT NULL,
	"ongoing" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_budgets" ADD CONSTRAINT "weekly_budgets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_budgets" ADD CONSTRAINT "weekly_budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_budgets_unique" ON "weekly_budgets" USING btree ("household_id","category_id","week_start","ongoing");

--> statement-breakpoint
-- Hand written from here.
alter table public.weekly_budgets enable row level security;
--> statement-breakpoint
create policy weekly_budgets_member_access on public.weekly_budgets
  for all to authenticated
  using (household_id in (select public.current_user_households()))
  with check (household_id in (select public.current_user_households()));
--> statement-breakpoint
create trigger weekly_budgets_touch_updated_at
  before update on public.weekly_budgets
  for each row execute function public.touch_updated_at();
--> statement-breakpoint
-- Neon has no default privileges (0016): a table without its grant is unreadable.
grant select, insert, update, delete on public.weekly_budgets to authenticated;
--> statement-breakpoint
-- The form only offers Mondays and whole rupiah; this is the last place that
-- can refuse a Wednesday or a negative budget.
alter table public.weekly_budgets add constraint weekly_budgets_monday check (
  extract(isodow from week_start) = 1
  and amount >= 0
);
