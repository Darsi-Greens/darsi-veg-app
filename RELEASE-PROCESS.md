# Darsi Greens — Release Process

## Environment Overview

| | DEV | STG | PROD |
|--|-----|-----|------|
| Firebase project | `darsi-veg-dev` | `darsi-veg-staging` | `darsi-veg-shop` |
| App name | NRB Veg DEV | NRB Veg BETA | NRB Vegetables |
| Android package | `com.nrbveg.dev` | `com.nrbveg.staging` | `com.nrbveg.app` |
| Banner | 🔧 DEV (red) | 🧪 BETA - Parents Testing (orange) | None |
| Who uses | Developer only | Parents test new features | Parents daily use |
| Data safe to delete? | Yes | Yes | **NEVER** |

STG and PROD install side-by-side on the same phone because they have different package names.

---

## Version Naming

| Env | Format | Example |
|-----|--------|---------|
| DEV | `1.x.x-dev` | `1.2.0-dev` |
| STG | `1.x.x-rc.1` | `1.2.0-rc.1` |
| PROD | `1.x.x` | `1.2.0` |

To bump version: edit the base `1.0.0` in `app.config.js` (line with `version: \`1.0.0\${cfg.versionSuffix}\``).

---

## Release Flow (Step by Step)

### Step 1 — Build feature in DEV branch

```bash
git checkout -b feature/your-feature-name
npm run start:dev      # APP_ENV=development expo start
```

- DEV app shows **red banner** "🔧 DEV"
- All data goes to `darsi-veg-dev` Firestore — safe to mess with
- When feature works: proceed to Step 2

---

### Step 2 — Test yourself in DEV

Before moving to STG:
- [ ] Feature works end-to-end
- [ ] No console errors
- [ ] Offline: disable WiFi → use feature → re-enable → data syncs
- [ ] `npx expo export -p android` completes with 0 errors

---

### Step 3 — Merge to staging branch

```bash
git add .
git commit -m "feat: your feature description"
git checkout staging
git merge feature/your-feature-name
git push origin staging
```

---

### Step 4 — Build STG APK

```bash
npm run build:staging
# equivalent: eas build -p android --profile staging
```

EAS builds the APK with `APP_ENV=staging` → connects to `darsi-veg-staging` Firestore.

Download the APK link from EAS.

---

### Step 5 — Send STG APK to parents for testing

1. Send the STG APK via WhatsApp to parents
2. Parents install it alongside their existing PROD app
3. The BETA app shows **orange banner** "🧪 BETA - Parents Testing"
4. Parents test the new feature in the BETA app
5. Parents give feedback on WhatsApp

---

### Step 6 — Fix any issues found in STG

```bash
git checkout feature/your-feature-name
# fix the issue
git commit -m "fix: issue description"
git checkout staging
git merge feature/your-feature-name
```

Rebuild STG APK (Step 4) → send to parents again.

Repeat until parents are happy.

---

### Step 7 — Merge to main branch

```bash
git checkout main
git merge staging
git push origin main
```

---

### Step 8 — Build PROD APK

```bash
npm run build:prod
# equivalent: eas build -p android --profile production
```

EAS builds the APK with `APP_ENV=production` → connects to `darsi-veg-shop` Firestore.

---

### Step 9 — Send PROD APK to parents

1. Download the PROD APK from EAS
2. Send via WhatsApp to parents
3. Parents install — replaces their existing PROD app (same package `com.nrbveg.app`)
4. No banner — clean UI
5. This becomes their daily app

---

### Step 10 — Monitor Firestore (30 min)

After parents install, watch `darsi-veg-shop` Firestore:
- `sales` — sales appearing correctly?
- `vendor_orders` — orders saving?
- `daily_summary/{today}` — only ONE document? (`customer_count` updating, not creating duplicates)
- `stock_log` — wastage entries saving?

If broken → hotfix in feature branch → Steps 2-9 again.

---

## Running Locally

```bash
# Development (default)
npm run start:dev          # red "🔧 DEV" banner

# Staging
npm run start:staging      # orange "🧪 BETA" banner

# Production (only for final pre-release check)
npm run start:prod         # no banner
```

---

## Seeding Firestore

When setting up a new environment or resetting test data:

```bash
cd ../darsi-veg-data

# Seed DEV
node seeds/seed-vegetables.js --env=dev
node seeds/seed-vendors.js --env=dev

# Seed STG
node seeds/seed-vegetables.js --env=staging
node seeds/seed-vendors.js --env=staging

# Or use shortcuts:
npm run seed:dev
npm run seed:staging
```

To re-seed: delete the collection in Firebase Console first, then run seed again.

---

## Hotfix (urgent prod bug)

For a critical bug affecting parents right now:

1. Fix in `main` branch directly (or a `hotfix/` branch)
2. **Skip STG build** — go straight to `npm run build:prod`
3. Manual smoke test on your own phone (at least the affected flow)
4. Send PROD APK to parents immediately
5. Backfill: merge fix back to `staging` and `feature` branches

Document why staging was skipped in commit message.

---

## Files Reference

| File | Purpose |
|------|---------|
| `.env.development` | DEV Firebase keys — local only, not in git |
| `.env.staging` | STG Firebase keys — local only, not in git |
| `.env.production` | PROD Firebase keys — local only, not in git |
| `.env.*.example` | Templates — committed to git, no real keys |
| `app.config.js` | Dynamic Expo config — driven by `APP_ENV` |
| `eas.json` | EAS build profiles (dev/staging/production) |
| `scripts/generate-icons.js` | Creates placeholder colored PNGs |
| `assets/icon-dev.png` | Red icon — DEV APK |
| `assets/icon-staging.png` | Orange icon — STG APK |
| `assets/icon.png` | Green icon — PROD APK |
| `test-cases.md` | Full test suite to run before PROD build |
| `LAUNCH-CHECKLIST.md` | Pre-launch security + bug audit |

---

## First-Time EAS Setup

```bash
npm install -g eas-cli
eas login
eas build:configure   # links project to EAS — run once
```

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code — only merge from `staging` |
| `staging` | Integration — merge feature branches here for parent testing |
| `feature/*` | Individual features — branch off `main`, work here |
| `hotfix/*` | Urgent prod fixes — branch off `main`, merge back to main + staging |
