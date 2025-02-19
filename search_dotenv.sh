#!/usr/bin/env bash
# search_dotenv.sh

# Looks for lines referencing dotenv or environment variables in typical places:
# - The .env file
# - The Vite config
# - The Remix entry/server files
# - The Shopify CLI config
# - The "extensions/" directory used by Shopify

SEARCH_PATHS=(
  "./.env"
  "./vite.config.ts"
  "./remix.config.js"
  "./remix.config.ts"
  "./app"
  "./extensions"
  "./shopify.*"
  "./**/*.sh"
)

echo "Searching for common dotenv references or environment variable usage..."
echo

for path in "${SEARCH_PATHS[@]}"; do
  if compgen -G "$path" > /dev/null; then
    echo "=== Searching in: $path ==="
    grep -IHnE "dotenv|process\.env|SHOPIFY|loadEnv|require\('dotenv" $path 2>/dev/null
    echo
  fi
done

echo "Done."