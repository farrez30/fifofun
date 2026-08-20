#!/usr/bin/env bash
# Pushes the production environment from .env.local to the linked Vercel project.
#
# Values are piped straight from the file into the CLI's stdin, so no secret is
# ever echoed, quoted into a command line, or left in shell history.
#
# DATABASE_URL is excluded on purpose: it is the session pooler, used only by
# migrations run from a laptop. See docs/deploy.md.
set -uo pipefail

ENV_FILE=".env.local"
TARGET="${1:-production}"

VARS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  SUPABASE_SECRET_KEY
  DATABASE_POOL_URL
)

# The bot writes with the service key and therefore without row level security,
# and its household is configuration rather than anything derived from the
# request. A preview deployment is a second public URL onto the same rows, so
# these stay on production only and a preview simply answers 503.
if [ "$TARGET" = "production" ]; then
  VARS+=(
    TELEGRAM_BOT_TOKEN
    TELEGRAM_WEBHOOK_SECRET
    TELEGRAM_ALLOWED_CHAT_IDS
    TELEGRAM_HOUSEHOLD_ID
  )
fi

[ -f "$ENV_FILE" ] || { echo "no $ENV_FILE here"; exit 1; }

read_var() {
  # First match wins; strips one layer of surrounding quotes and any trailing CR.
  sed -n "s/^$1=//p" "$ENV_FILE" | head -1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

for name in "${VARS[@]}"; do
  value="$(read_var "$name")"
  if [ -z "$value" ]; then
    echo "skip   $name (kosong di $ENV_FILE)"
    continue
  fi
  # Remove first so a re-run updates instead of colliding. Silent when absent.
  printf '%s' "$value" | pnpm dlx vercel@latest env rm "$name" "$TARGET" --yes >/dev/null 2>&1
  if printf '%s' "$value" | pnpm dlx vercel@latest env add "$name" "$TARGET" >/dev/null 2>&1; then
    echo "set    $name"
  else
    echo "FAILED $name"
  fi
done
