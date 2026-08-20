#!/usr/bin/env bash
# Pushes an environment from .env.local to the linked Vercel project.
#
#   bash scripts/push-env.sh production
#   bash scripts/push-env.sh preview
#
# Values are piped straight from the file into the CLI's stdin, so no secret is
# ever echoed, quoted into a command line, or left in shell history.
#
# What lands is read back from Vercel rather than inferred from exit codes. The
# CLI returns 0 even when it refuses the operation and prints an error, so an
# exit status here means the command ran, not that anything changed.
#
# DATABASE_URL is excluded on purpose: it is the session pooler, used only by
# migrations run from a laptop. See docs/deploy.md.
set -uo pipefail

ENV_FILE=".env.local"
TARGET="${1:-production}"
VERCEL="pnpm dlx vercel@latest"

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

pushed=()

for name in "${VARS[@]}"; do
  value="$(read_var "$name")"
  if [ -z "$value" ]; then
    echo "skip    $name (kosong di $ENV_FILE)"
    continue
  fi

  # Remove first so a re-run updates instead of colliding. A name that is not
  # there yet reports env_not_found, which is the expected case and not an error.
  $VERCEL env rm "$name" "$TARGET" --yes >/dev/null 2>&1

  # stderr is kept: it carries the only honest signal the CLI gives.
  if ! printf '%s' "$value" | $VERCEL env add "$name" "$TARGET" >/dev/null; then
    echo "error   $name (lihat pesan di atas)"
    continue
  fi
  pushed+=("$name")
done

echo
echo "Membaca ulang dari Vercel..."
listing="$($VERCEL env ls "$TARGET" 2>/dev/null)"

failed=0
for name in "${pushed[@]:-}"; do
  [ -n "$name" ] || continue
  if grep -qE "^[[:space:]]*$name[[:space:]]" <<<"$listing"; then
    echo "ok      $name"
  else
    echo "HILANG  $name — perintahnya lolos tapi nilainya tidak ada di $TARGET"
    failed=1
  fi
done

exit $failed
