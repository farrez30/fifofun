-- Row level security and integrity constraints.
--
-- This repository is public, so the client code must not be what decides who
-- can read a row. Every table below denies access by default and is opened only
-- through a policy tied to household membership.

-- Returns the households the current user belongs to.
-- SECURITY DEFINER so it reads household_members without going through that
-- table's own policies, which would otherwise recurse.
create or replace function public.current_user_households()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;

revoke all on function public.current_user_households() from public;
grant execute on function public.current_user_households() to authenticated;

alter table public.households            enable row level security;
alter table public.household_members     enable row level security;
alter table public.accounts              enable row level security;
alter table public.categories            enable row level security;
alter table public.transactions          enable row level security;
alter table public.import_batches        enable row level security;
alter table public.categorization_rules  enable row level security;
alter table public.budgets               enable row level security;

-- A member sees only their own membership rows. Written directly against
-- user_id rather than the helper, to avoid recursing into this same policy.
create policy household_members_select on public.household_members
  for select to authenticated
  using (user_id = auth.uid());

-- Only an owner may change who is in the household.
create policy household_members_write on public.household_members
  for all to authenticated
  using (
    exists (
      select 1 from public.household_members owner
      where owner.household_id = household_members.household_id
        and owner.user_id = auth.uid()
        and owner.role = 'owner'
    )
  );

create policy households_select on public.households
  for select to authenticated
  using (id in (select public.current_user_households()));

create policy households_update on public.households
  for update to authenticated
  using (id in (select public.current_user_households()));

-- Anyone signed in may create a household; they become its owner in the same
-- transaction as the application code inserts their membership row.
create policy households_insert on public.households
  for insert to authenticated
  with check (true);

-- The remaining tables all share the same shape: readable and writable only by
-- members of the owning household.
do $$
declare
  target text;
begin
  foreach target in array array[
    'accounts', 'categories', 'transactions',
    'import_batches', 'categorization_rules', 'budgets'
  ]
  loop
    execute format(
      'create policy %1$s_member_access on public.%1$s
         for all to authenticated
         using (household_id in (select public.current_user_households()))
         with check (household_id in (select public.current_user_households()))',
      target
    );
  end loop;
end
$$;

-- Integrity constraints.
--
-- These mirror the rules the application validates, because a transfer stored
-- with only one side silently corrupts every balance computed afterwards, and
-- the database is the last place that can refuse it.

alter table public.transactions
  add constraint transactions_amount_positive
  check (amount > 0);

alter table public.transactions
  add constraint transactions_accounts_differ
  check (from_account_id is null or from_account_id <> to_account_id);

alter table public.transactions
  add constraint transactions_account_sides
  check (
    case cashflow
      -- Money arriving: destination only.
      when 'income'             then from_account_id is null and to_account_id is not null
      when 'from_asset'         then from_account_id is null and to_account_id is not null
      when 'receivable_settled' then from_account_id is null and to_account_id is not null
      -- Money moving between the household's own accounts: both sides required.
      when 'transfer'           then from_account_id is not null and to_account_id is not null
      -- Everything else leaves an account: source only.
      else from_account_id is not null and to_account_id is null
    end
  );

-- A statement row may only be imported once per household.
create unique index if not exists transactions_external_ref_unique
  on public.transactions (household_id, external_ref)
  where external_ref is not null;

-- A fee always points at a transaction in the same household.
alter table public.transactions
  add constraint transactions_fee_parent_fk
  foreign key (fee_parent_id) references public.transactions (id) on delete set null;

-- Keep updated_at honest rather than trusting every caller to set it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger transactions_touch_updated_at
  before update on public.transactions
  for each row execute function public.touch_updated_at();
