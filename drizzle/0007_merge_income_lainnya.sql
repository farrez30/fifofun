-- Folding "Income Lainnya" back into "Other Income".
--
-- The seed created both, side by side, under the same cashflow and with the
-- same icon. Nothing ever read the second one: the importer files a bonus under
-- "Other Income" and looks that name up literally, while "Income Lainnya" was
-- never a target of anything. What it did do was offer two identical choices in
-- the review queue, so the same kind of income could end up split across two
-- rows in Laporan depending on which one somebody happened to pick.
--
-- The seed no longer creates it. This moves whatever already points at it, then
-- takes the row away. Nothing is deleted before its rows have somewhere to go,
-- and a second run matches nothing, so re-running is safe.

-- A household that somehow has the duplicate but not the kept name has nothing
-- to merge into. Renaming it is the merge.
update public.categories dup
set name = 'Other Income'
where dup.name = 'Income Lainnya'
  and dup.cashflow = 'income'
  and not exists (
    select 1
    from public.categories keep
    where keep.household_id = dup.household_id
      and keep.cashflow = 'income'
      and keep.name = 'Other Income'
  );
--> statement-breakpoint
-- Budgets first, because `budgets_unique` is on (household, period, category)
-- and repointing a row at a category that already has a budget for the same
-- month would collide. Where both months exist the two amounts are one budget
-- for one category, so they add up; the duplicate's row is then gone.
with folded as (
  delete from public.budgets dup
  using public.categories dup_c
  where dup.category_id = dup_c.id
    and dup_c.name = 'Income Lainnya'
    and dup_c.cashflow = 'income'
    and exists (
      select 1
      from public.budgets keep
      join public.categories keep_c on keep_c.id = keep.category_id
      where keep.household_id = dup.household_id
        and keep.period = dup.period
        and keep_c.household_id = dup_c.household_id
        and keep_c.cashflow = 'income'
        and keep_c.name = 'Other Income'
    )
  returning dup.household_id, dup.period, dup.amount
)
update public.budgets keep
set amount = keep.amount + folded.amount
from folded, public.categories keep_c
where keep.category_id = keep_c.id
  and keep.household_id = folded.household_id
  and keep.period = folded.period
  and keep_c.household_id = folded.household_id
  and keep_c.cashflow = 'income'
  and keep_c.name = 'Other Income';
--> statement-breakpoint
-- The months the kept category had no budget for move across as they are.
update public.budgets b
set category_id = keep_c.id
from public.categories dup_c
join public.categories keep_c
  on keep_c.household_id = dup_c.household_id
 and keep_c.cashflow = 'income'
 and keep_c.name = 'Other Income'
where b.category_id = dup_c.id
  and dup_c.name = 'Income Lainnya'
  and dup_c.cashflow = 'income';
--> statement-breakpoint
update public.transactions t
set category_id = keep_c.id
from public.categories dup_c
join public.categories keep_c
  on keep_c.household_id = dup_c.household_id
 and keep_c.cashflow = 'income'
 and keep_c.name = 'Other Income'
where t.category_id = dup_c.id
  and dup_c.name = 'Income Lainnya'
  and dup_c.cashflow = 'income';
--> statement-breakpoint
-- Two rules pointing at the same category is allowed and harmless; there is no
-- unique index here to work around.
update public.categorization_rules r
set category_id = keep_c.id
from public.categories dup_c
join public.categories keep_c
  on keep_c.household_id = dup_c.household_id
 and keep_c.cashflow = 'income'
 and keep_c.name = 'Other Income'
where r.category_id = dup_c.id
  and dup_c.name = 'Income Lainnya'
  and dup_c.cashflow = 'income';
--> statement-breakpoint
delete from public.categories
where name = 'Income Lainnya'
  and cashflow = 'income';
