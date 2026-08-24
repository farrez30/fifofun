-- Categories can belong to a group.
--
-- Everything above the second rule is generated from src/db/schema.ts.
-- Everything below is not: a self reference needs a guard no CHECK can give,
-- because a CHECK sees one row and the rule is about two.
--
-- One level, deliberately. A grandparent would need a recursive rollup in
-- every report and a depth in the head of everyone reading one, to buy a
-- nesting nobody asked for.

ALTER TABLE "categories" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("household_id","parent_id");
--> statement-breakpoint
create or replace function public.categories_one_level() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'a category cannot be its own group';
  end if;

  -- The group has to exist, belong to the same household, and be a group
  -- rather than something already inside one.
  if not exists (
    select 1 from public.categories parent
    where parent.id = new.parent_id
      and parent.household_id = new.household_id
      and parent.parent_id is null
  ) then
    raise exception 'a group must belong to the same household and have no group of its own';
  end if;

  return new;
end;
$$;
--> statement-breakpoint
create trigger categories_one_level_insert
  before insert or update of parent_id, household_id on public.categories
  for each row execute function public.categories_one_level();
--> statement-breakpoint
-- The other half of the same rule: a category that already has children cannot
-- be moved inside a group, which would make its children grandchildren.
create or replace function public.categories_no_grandchildren() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.parent_id is not null and exists (
    select 1 from public.categories child where child.parent_id = new.id
  ) then
    raise exception 'a category with things inside it cannot be put inside another';
  end if;

  return new;
end;
$$;
--> statement-breakpoint
create trigger categories_no_grandchildren_update
  before update of parent_id on public.categories
  for each row execute function public.categories_no_grandchildren();
--> statement-breakpoint
-- 0005 explains why this is written out rather than left to the schema
-- default: Supabase grants EXECUTE on new functions to anon, and revoking from
-- PUBLIC does not touch that grant.
revoke all on function public.categories_one_level() from public, anon, authenticated;
--> statement-breakpoint
revoke all on function public.categories_no_grandchildren() from public, anon, authenticated;
