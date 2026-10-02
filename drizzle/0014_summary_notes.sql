-- A few lines of the household's own under the three-month summary.
--
-- The summary page is shown to somebody else, and this is the one place on it
-- the household writes in its own words ("Mulai Okt: nabung 1 jt/bln"). One
-- row per household, so the household id is the key and saving is an upsert.
--
-- Everything above the hand-written section is generated from
-- src/db/schema.ts; the policy, trigger and check follow 0012.

CREATE TABLE "summary_notes" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "summary_notes" ADD CONSTRAINT "summary_notes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Hand written from here.
alter table public.summary_notes enable row level security;
--> statement-breakpoint
create policy summary_notes_member_access on public.summary_notes
  for all to authenticated
  using (household_id in (select public.current_user_households()))
  with check (household_id in (select public.current_user_households()));
--> statement-breakpoint
create trigger summary_notes_touch_updated_at
  before update on public.summary_notes
  for each row execute function public.touch_updated_at();
--> statement-breakpoint
-- The form allows the same; this is the last place that can refuse a novel.
alter table public.summary_notes add constraint summary_notes_length check (length(body) <= 1000);
