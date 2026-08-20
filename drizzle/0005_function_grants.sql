-- Taking back an execute grant nobody here issued.
--
-- Supabase ships ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON
-- FUNCTIONS TO anon, authenticated, service_role. Every function created in
-- this schema therefore arrives executable by anon, whatever the migration that
-- created it intended.
--
-- 0001 and 0004 both wrote `revoke all ... from public` before granting, and
-- that revoke is not the one that was needed: PUBLIC is the pseudo-role every
-- login inherits, while anon holds a grant of its own from the default above.
-- Revoking from PUBLIC leaves the direct grant to anon exactly where it was.
--
-- Neither function was reachable in any useful sense: both read auth.uid(),
-- which is null for anon, so both answer an anonymous caller with nothing. This
-- is the layer behind that one. The next definer function written here will
-- also arrive anon-executable, and the one after that may not check auth.uid()
-- in its first three lines.

revoke execute on function public.redeem_invite(text) from anon;
--> statement-breakpoint
revoke execute on function public.current_user_households() from anon;
--> statement-breakpoint
-- invite_is_open keeps its grant to anon deliberately: it is asked before an
-- account exists, so there is no authenticated caller to ask it. It answers a
-- bare boolean and reads no table the caller could not already guess at.
select 1;
