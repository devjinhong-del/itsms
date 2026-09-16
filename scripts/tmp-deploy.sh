#!/usr/bin/env bash
set -euo pipefail
GT=$(grep -E '^GITHUB_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"'\r')
VT=$(grep -E '^VERCEL_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"'\r')
git add -A
git commit -q -F .git/COMMIT_MSG_TMP
git push --quiet "https://x-access-token:${GT}@github.com/devjinhong-del/itsms.git" master
npx --yes vercel@latest deploy --prod --yes --token "$VT" 2>&1 | grep -E "Aliased|Error" | tail -3
