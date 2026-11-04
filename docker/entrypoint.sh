#!/bin/sh
set -eu

node scripts/prepare-local-db.mjs
./node_modules/.bin/prisma migrate deploy

exec ./node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
