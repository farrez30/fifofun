-- Manual entries, splits, planner state, and a stable handle for every account.
--
-- Everything above this line is generated from src/db/schema.ts. Everything
-- below is not: policies, checks, triggers and backfills have no Drizzle
-- equivalent, so they are written by hand here, the same way 0001 and 0004 were.
--
-- The backfills matter as much as the columns. A category with no colour would
-- draw a different hue on every page that guessed one, and an account with no
-- key would stop receiving imports the moment somebody renamed it, which is
-- exactly the failure this migration exists to remove.

CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"income" bigint NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"irregular_income" boolean DEFAULT false NOT NULL,
	"wants_zakat" boolean DEFAULT false NOT NULL,
	"framework_id" text NOT NULL,
	"track" text DEFAULT 'negeri' NOT NULL,
	"target_tier" text DEFAULT 'seimbang' NOT NULL,
	"target_savings" bigint NOT NULL,
	"child_plans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"goal_target" bigint NOT NULL,
	"goal_years" integer DEFAULT 10 NOT NULL,
	"goal_saved" bigint DEFAULT 0 NOT NULL,
	"hajj_monthly" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "planned_monthly" bigint;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "planned_share_bp" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "duplicate_of" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "split_of" uuid;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plans_household_unique" ON "plans" USING btree ("household_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_duplicate_of_transactions_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_split_of_transactions_id_fk" FOREIGN KEY ("split_of") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_key_unique" ON "accounts" USING btree ("household_id","key") WHERE key is not null;--> statement-breakpoint
CREATE INDEX "transactions_duplicate_idx" ON "transactions" USING btree ("household_id","duplicate_of") WHERE duplicate_of is not null;--> statement-breakpoint
CREATE INDEX "transactions_split_idx" ON "transactions" USING btree ("household_id","split_of") WHERE split_of is not null;
--> statement-breakpoint
alter table public.plans enable row level security;
--> statement-breakpoint
create policy plans_member_access on public.plans
  for all to authenticated
  using (household_id in (select public.current_user_households()))
  with check (household_id in (select public.current_user_households()));
--> statement-breakpoint
create trigger plans_touch_updated_at
  before update on public.plans
  for each row execute function public.touch_updated_at();
--> statement-breakpoint
-- The application validates the same bounds; the database is the last place
-- that can refuse a figure no screen would ever produce.
alter table public.plans add constraint plans_bounds check (
  income >= 0 and target_savings >= 0 and goal_target >= 0 and goal_saved >= 0
  and hajj_monthly >= 0
  and adults between 1 and 2 and children between 0 and 4 and goal_years between 1 and 40
  and track in ('negeri','swasta','internasional')
  and target_tier in ('hemat','seimbang','nyaman','premium')
  and jsonb_typeof(child_plans) = 'array'
);
--> statement-breakpoint
alter table public.categories add constraint categories_planned_share_bp_range
  check (planned_share_bp is null or planned_share_bp between 0 and 10000);
--> statement-breakpoint
alter table public.categories add constraint categories_planned_monthly_positive
  check (planned_monthly is null or planned_monthly > 0);
--> statement-breakpoint
-- Colours and icons for the categories this app seeds. The list is printed
-- from SEED_PALETTE in src/lib/ledger/palette.ts, and a unit test asserts that
-- every seeded name has an entry there, so the two cannot drift apart.
update public.categories c
set color = coalesce(c.color, v.hue::text), icon = coalesce(c.icon, v.icon)
from (values
  ('Gaji', 0, 'Briefcase'),
  ('Freelance', 138, 'Laptop'),
  ('Business', 275, 'Storefront'),
  ('Pinjaman', 53, 'Handshake'),
  ('Penyesuaian Income', 190, 'Scales'),
  ('Other Income', 328, 'HandCoins'),
  ('Income Lainnya', 105, 'HandCoins'),
  ('Makan/minum', 243, 'ForkKnife'),
  ('Transport', 20, 'Bus'),
  ('Belanja', 158, 'ShoppingBag'),
  ('Internet', 295, 'WifiHigh'),
  ('Keluarga', 73, 'Users'),
  ('Rumah', 210, 'House'),
  ('Jajan', 348, 'Cookie'),
  ('Sedekah', 125, 'HandHeart'),
  ('Skin & Body Care', 263, 'Drop'),
  ('Hiburan', 40, 'Television'),
  ('Hadiah', 178, 'Gift'),
  ('Kesehatan', 315, 'FirstAid'),
  ('Kosan', 93, 'Bed'),
  ('Dating', 230, 'Heart'),
  ('Kendaraan', 8, 'Car'),
  ('Edukasi', 145, 'GraduationCap'),
  ('Bensin', 283, 'GasPump'),
  ('Biaya Bank', 60, 'Bank'),
  ('Other spending', 198, 'Tag'),
  ('Penyesuaian Spending', 335, 'Scales'),
  ('Bayar Kontrakan', 113, 'Key'),
  ('Langganan Parkee', 250, 'Car'),
  ('Aeropolis Gym & Pool', 28, 'Barbell'),
  ('Wifi', 165, 'WifiHigh'),
  ('Langganan Youtube', 303, 'Television'),
  ('Langganan Spotify', 80, 'MusicNote'),
  ('Langganan MileageTrk', 218, 'ChartLine'),
  ('Langganan Groupy', 355, 'Users'),
  ('Langganan Gdrive', 133, 'CloudArrowUp'),
  ('Langganan DanceFitMe', 270, 'Barbell'),
  ('Google Workspace', 48, 'Briefcase'),
  ('Listrik', 185, 'Lightning'),
  ('Pulsa & Data', 323, 'DeviceMobile'),
  ('Tabungan', 100, 'PiggyBank'),
  ('Dana Darurat', 238, 'ShieldCheck'),
  ('Reksadana', 15, 'ChartLineUp'),
  ('Pajak Kendaraan', 153, 'Invoice'),
  ('Dana Menikah', 290, 'Confetti'),
  ('Dana Rumah', 68, 'House'),
  ('Dana Mobil', 205, 'Car'),
  ('Antar Account', 343, 'ArrowsLeftRight'),
  ('Piutang', 120, 'Handshake')
) as v(name, hue, icon)
where c.name = v.name;
--> statement-breakpoint
-- Everything a household made up itself. Postgres hashtext is not the FNV the
-- application falls back to, and it does not need to be: a stored colour always
-- wins, so this only decides the hue of a category that never had one.
update public.categories
set color = coalesce(color, ((hashtext(name) & 2147483647) % 360)::text),
    icon = coalesce(icon, case cashflow
      when 'income' then 'HandCoins'
      when 'spending' then 'ShoppingBag'
      when 'bills' then 'Receipt'
      when 'invest_savings' then 'PiggyBank'
      when 'sinking_fund' then 'Vault'
      when 'financial_goal' then 'Target'
      when 'transfer' then 'ArrowsLeftRight'
      when 'debt_payment' then 'Invoice'
      when 'receivable_new' then 'Handshake'
      when 'receivable_settled' then 'Handshake'
      when 'from_asset' then 'PiggyBank'
    end);
--> statement-breakpoint
-- The importer and the bot used to find their accounts by name. The keys below
-- are handed out by the name each account still has today; a household holding
-- two accounts of the same name gets neither, and the settings page says so
-- rather than guessing which one the statement means.
update public.accounts a
set key = v.key
from (values ('Bank Mandiri', 'mandiri'), ('Cash', 'cash'), ('GoPay', 'gopay'), ('DANA', 'dana'), ('ShopeePay', 'shopeepay'), ('OVO', 'ovo'), ('LinkAja', 'linkaja'), ('e-Money', 'emoney')) as v(name, key)
where a.key is null and a.name = v.name and a.archived_at is null
  and (select count(*) from public.accounts b
       where b.household_id = a.household_id and b.name = a.name) = 1;
--> statement-breakpoint
alter table public.accounts add constraint accounts_key_shape
  check (key is null or key ~ '^[a-z0-9]{1,32}$');
--> statement-breakpoint
-- Every row carries sort_order 0 today, so the first reorder would have had to
-- renumber the whole list. Numbering them once here keeps a move to two writes.
update public.accounts a set sort_order = v.rn
from (
  select id, row_number() over (
    partition by household_id
    order by coalesce(array_position(array['mandiri', 'cash', 'gopay', 'dana', 'shopeepay', 'ovo', 'linkaja', 'emoney'], key), 99), name
  ) - 1 as rn
  from public.accounts
) v
where a.id = v.id;
--> statement-breakpoint
update public.categories c set sort_order = v.rn
from (
  select id, row_number() over (
    partition by household_id
    order by array_position(array[
      'income','spending','bills','invest_savings','sinking_fund','financial_goal',
      'from_asset','transfer','debt_payment','receivable_new','receivable_settled'
    ], cashflow::text), name
  ) - 1 as rn
  from public.categories
) v
where c.id = v.id;
--> statement-breakpoint
-- A row that is its own duplicate or its own part is a loop no reader could
-- follow, and both columns are written by application code that can be wrong.
alter table public.transactions add constraint transactions_links_not_self check (
  (duplicate_of is null or duplicate_of <> id)
  and (split_of is null or split_of <> id)
);
