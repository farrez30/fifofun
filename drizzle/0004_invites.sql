-- Invite codes: the gate in front of registration.
--
-- This deployment is public and its front door was open. Anyone could create an
-- account, and nothing in the application could give them a household, so they
-- arrived at a permanent dead end and the auth table filled with strangers.
--
-- The table below is generated from src/db/schema.ts. Everything after it is
-- not: policies, grants and functions have no Drizzle equivalent, so they are
-- written by hand here, the same way 0001 was.
--
-- Every function takes the SHA-256 of the code rather than the code itself. The
-- hashing happens in the application, so the code never travels to the database
-- and never appears in a statement log.

CREATE TABLE "household_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"redeemed_by" uuid,
	CONSTRAINT "household_invites_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "household_invites_household_idx" ON "household_invites" USING btree ("household_id");
--> statement-breakpoint
-- auth.users is Supabase's table and Drizzle does not model it, so the two
-- references to it are added here. Set null rather than cascade: deleting an
-- account should not erase the record that somebody was invited.
ALTER TABLE "household_invites"
  ADD CONSTRAINT household_invites_created_by_fk
  FOREIGN KEY ("created_by") REFERENCES auth.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "household_invites"
  ADD CONSTRAINT household_invites_redeemed_by_fk
  FOREIGN KEY ("redeemed_by") REFERENCES auth.users(id) ON DELETE SET NULL;
--> statement-breakpoint
alter table public.household_invites enable row level security;
--> statement-breakpoint

-- Members manage their own household's invitations, and see nobody else's.
create policy household_invites_member_access on public.household_invites
  for all to authenticated
  using (household_id in (select public.current_user_households()))
  with check (household_id in (select public.current_user_households()));

/*
  Is this code worth creating an account for?

  Callable before sign-up, so it answers to anon, which is why it returns a bare
  boolean: no household, no name, no expiry, nothing an unauthenticated caller
  could learn by asking. There is no rate limit in front of it on purpose. A
  code is fifty bits of randomness, so guessing is not a strategy that a limit
  would need to defeat.
*/
create or replace function public.invite_is_open(p_code_hash text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_invites
    where code_hash = p_code_hash
      and redeemed_at is null
      and expires_at > now()
  )
$$;

revoke all on function public.invite_is_open(text) from public;
grant execute on function public.invite_is_open(text) to anon, authenticated;

/*
  Accepting an invitation.

  This exists as a definer function because the membership row has to be written
  for somebody who is not yet a member, and household_members_write requires the
  writer to already be an owner. The alternatives were a policy letting anyone
  insert themselves into any household, or handing the application a key that
  bypasses row level security altogether. Both give away more than this does:
  here the authority is one function, and what it will write is fixed.

  It locks the row before reading it, so two people racing on the same code
  produce one member and one refusal rather than two members.

  It writes into household_members, whose policy would refuse the caller. That
  works because the function runs as its owner and no table here sets FORCE ROW
  LEVEL SECURITY, which is the same thing current_user_households already relies
  on. Adding FORCE to household_members would break both, silently.

  The distinct return values do tell a caller that a hash they guessed exists.
  At fifty bits that is not reachable, and the alternative is telling somebody
  whose invitation simply expired that their code was never real.
*/
create or replace function public.redeem_invite(p_code_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.household_invites%rowtype;
  caller uuid := auth.uid();
begin
  if caller is null then
    return 'unauthenticated';
  end if;

  -- The application reads one household per account and has nowhere to show a
  -- second, so joining another would make which one it shows a coin toss.
  if exists (select 1 from public.household_members where user_id = caller) then
    return 'already_member';
  end if;

  select * into invite
  from public.household_invites
  where code_hash = p_code_hash
  for update;

  if not found then return 'unknown'; end if;
  if invite.redeemed_at is not null then return 'redeemed'; end if;
  if invite.expires_at <= now() then return 'expired'; end if;

  -- A member, not an owner. Managing who else is in the household stays with
  -- whoever set it up, and an invitation is not a transfer of that.
  insert into public.household_members (household_id, user_id, role)
  values (invite.household_id, caller, 'member');

  update public.household_invites
  set redeemed_at = now(), redeemed_by = caller
  where id = invite.id;

  return 'ok';
end;
$$;

revoke all on function public.redeem_invite(text) from public;
grant execute on function public.redeem_invite(text) to authenticated;
