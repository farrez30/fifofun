-- Each account's institution colour and app icon, so a picker of twelve
-- accounts can be read by colour before it is read by name.
--
-- The icon is stored here and not committed to `public/`: the repo is public
-- and the icons belong to the banks, so the app keeps its one private copy
-- behind the household's row-level security (the existing accounts policy
-- already covers these columns). `logo_hash` lets `/akun/[id]/logo` be cached
-- forever and still change the moment the icon does.
--
-- Everything above the hand-written section is generated from
-- src/db/schema.ts.

ALTER TABLE "accounts" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "logo_hash" text GENERATED ALWAYS AS (md5(logo)) STORED;
--> statement-breakpoint
-- Hand written from here.
-- Lowercase hex only, so the form, the chip and this check agree on one spelling.
alter table public.accounts add constraint accounts_color_hex check (color ~ '^#[0-9a-f]{6}$');
--> statement-breakpoint
-- The server writes a re-encoded 64px WebP of a few kilobytes; 16 KiB of
-- bytes (21 848 base64 characters) leaves room and refuses anything else.
alter table public.accounts add constraint accounts_logo_size check (length(logo) <= 21848);
