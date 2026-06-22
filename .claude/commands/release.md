---
description: STG→PROD release runbook for NRB Vegetables (checklist-driven, safe)
argument-hint: (optional) version note
allowed-tools: Bash, Read, Grep
---

Run the NRB Vegetables release runbook. Work through these gates IN ORDER and stop if any fails. Report status of each. Release note: $ARGUMENTS

## Repos & trunks (don't confuse them)
- App code: `darsi-veg-app`, trunk = **`master`** (the empty `main` branch is a stray — ignore it).
- Backend rules: `darsi-veg-backend`, trunk = **`main`**.

## Gate 1 — Source is clean
- `cd darsi-veg-app` → confirm on `master`, working tree clean, in sync with `origin/master`.
- If there are uncommitted changes, stop and ask the user to commit/push first.

## Gate 2 — Staging verification
- Confirm a **staging APK built from current `master`** is installed and the user has run `PARENT-TEST-GUIDE.md` against it (orange BETA banner, writes landing in `darsi-veg-staging`, sync dot green).
- If not done, build it: `npm run ship -- staging` (or `npm run build:staging`), then have the user test. Do NOT proceed to prod until staging passes.

## Gate 3 — Staging rules deployed & verified
- Ensure `darsi-veg-backend` `firestore.rules` is deployed to `darsi-veg-staging` and the staging app reads/writes fine (anonymous auth working). Use `/deploy-rules staging` if needed.

## Gate 4 — Build PROD from master
- Confirm Anonymous Auth provider is enabled in `darsi-veg-shop`.
- Build the production APK FROM `master` (must contain the anon-auth code): `npm run ship -- production` (it will ask for confirmation), or `npm run build:prod`.

## Gate 5 — Deploy PROD rules LAST
- Only AFTER the new PROD APK is built/installed, deploy rules to prod: `/deploy-rules prod`.
- Rationale: the hardened rules require `request.auth != null`; deploying them before the matching app build would lock out the production app.

## Gate 6 — Smoke test PROD
- Confirm the production app (no banner) reads prices, records a sale, sync dot green, and the doc lands in `darsi-veg-shop` Firestore.

## Reminders
- NEVER test features directly in PROD — DEV → STG → PROD.
- `daily_summary` uses date-as-id; no `orderBy` in queries (composite indexes not set up).
- Regenerate the parent test sheet if features changed: `npm run guide:pdf`.

Summarize which gates passed and what (if anything) remains.
