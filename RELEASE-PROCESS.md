# Darsi Greens — Release Process

## Environment Overview

| Environment | Firebase Project | App Name | Android Package | Who |
|------------|-----------------|----------|----------------|-----|
| DEV | `darsi-veg-dev` | NRB Veg DEV 🔧 | `com.darsigreens.veg.dev` | Developer |
| STAGING | `darsi-veg-staging` | NRB Veg QA 🧪 | `com.darsigreens.veg.staging` | Developer testing |
| PROD | `darsi-veg-shop` | NRB Vegetables | `com.darsigreens.veg` | Parents |

All three APKs can be installed on the same phone simultaneously — they have different package names.

---

## Version Naming

| Environment | Version format | Example |
|------------|---------------|---------|
| DEV | `1.x.x-dev` | `1.2.0-dev` |
| STAGING | `1.x.x-rc.1` | `1.2.0-rc.1` |
| PROD | `1.x.x` | `1.2.0` |

Update the base version in `app.config.js` line: `version: \`1.0.0\${VERSION_SUFFIX[APP_ENV]...}`.

---

## Step-by-Step Release Process

### Step 1 — Build feature in DEV

```bash
# Start the app connected to darsi-veg-dev Firebase
npm run start:dev
```

- Write code, test on your phone or emulator
- The DEV app shows an **orange banner** "🔧 DEV MODE"
- Data goes to `darsi-veg-dev` Firestore — safe to delete/reset anytime
- When feature works locally → proceed to Step 2

---

### Step 2 — Test in DEV locally

Before moving to staging, verify:
- [ ] Feature works end-to-end
- [ ] No console errors or yellow warnings
- [ ] Offline scenario: turn off WiFi → use feature → turn on WiFi → data syncs
- [ ] Build export passes: `npx expo export -p android` → 0 errors

---

### Step 3 — Build staging APK

```bash
npm run build:staging
# equivalent: eas build -p android --profile staging
```

EAS will:
1. Set `APP_ENV=staging` (picks up `.env.staging` config)
2. Build signed APK targeting `com.darsigreens.veg.staging`
3. Give you a download link

Download the APK. Install on your personal Android phone.

> The staging APK shows an **amber banner** "🧪 QA - Ghost Testing"

---

### Step 4 — Run full test suite in staging

Install the staging APK on your phone. Go through **every test case** in `test-cases.md`:

#### Mandatory checks
- [ ] TC-E2E-01 through TC-E2E-05 (full day flow)
- [ ] TC-ORD-01 through TC-ORD-09 (orders edge cases)
- [ ] TC-PRC-01 through TC-PRC-05 (prices edge cases)
- [ ] TC-SAL-01 through TC-SAL-07 (sales edge cases)
- [ ] TC-OFF-01 through TC-OFF-05 (offline scenarios)
- [ ] TC-AUDIT-01 through TC-AUDIT-04 (regression audit)

#### What to watch for
- Does the correct Firebase project receive the data? (check `darsi-veg-staging` Firestore)
- Does the banner say "🧪 QA - Ghost Testing"?
- Are all amounts in Telugu/Indian format?
- Do big buttons work with fat thumbs?

**If any test fails** → fix in DEV → rebuild staging → re-test. Do NOT proceed to production with a known bug.

---

### Step 5 — Build production APK

Only after **all** staging tests pass:

```bash
npm run build:prod
# equivalent: eas build -p android --profile production
```

EAS will:
1. Set `APP_ENV=production` (picks up `.env.production` config)
2. Build signed APK targeting `com.darsigreens.veg`
3. Give you a download link

> The production APK has **no banner** — clean for parents.

---

### Step 6 — Send to parents

1. Download the production APK from EAS
2. Send via WhatsApp to parents
3. Parents install → tap to replace old version (same package name)
4. Confirm they can log in and use the app

---

### Step 7 — Monitor Firestore

After sending to parents, watch `darsi-veg-shop` Firestore for 30 minutes:

- Check `sales` collection — entries appearing correctly?
- Check `vendor_orders` — orders saving?
- Check `daily_summary` — customer count updating (not creating duplicate docs)?
- Check `stock_log` — wastage entries saving?

If something is broken → hotfix in DEV → go through Steps 1-6 again.

---

## First-Time Setup Checklist

Before you can use this release process, complete these one-time setup steps:

### 1. Create Firebase projects
Go to https://console.firebase.google.com and create:
- [ ] `darsi-veg-dev` project (free Spark plan is fine)
- [ ] `darsi-veg-staging` project (free Spark plan is fine)
- [ ] `darsi-veg-shop` already exists (your live project)

For each new project, enable:
- Firestore Database (start in test mode, then apply `firestore.rules`)
- Authentication (not needed yet, but good to enable for future)

### 2. Fill env files
Copy values from Firebase Console → Project Settings → Your apps → Web app:

```bash
# Fill .env.development with darsi-veg-dev keys
# Fill .env.staging with darsi-veg-staging keys
# Fill .env.production with darsi-veg-shop keys (copy from your existing .env)
```

### 3. Generate icons
```bash
npm run icons
# Creates assets/ with 7 PNG files
# Replace with proper branded icons before final release
```

### 4. Install EAS CLI
```bash
npm install -g eas-cli
eas login    # log in with your Expo account
eas build:configure   # links this project to EAS
```

### 5. Upload Firestore rules to each project
```bash
# For each Firebase project, run:
firebase use darsi-veg-dev
firebase deploy --only firestore:rules

firebase use darsi-veg-staging
firebase deploy --only firestore:rules

firebase use darsi-veg-shop
firebase deploy --only firestore:rules
```

---

## Hotfix Process (urgent prod bug)

For a critical bug affecting parents right now:

1. Fix the bug in DEV
2. **Skip staging build** — go straight to production APK
3. Do a manual smoke test on the production APK on your phone (at least the affected flow)
4. Send to parents
5. Backfill: rebuild staging APK and run full test suite after parents are unblocked

Document the reason for skipping staging in git commit message.

---

## Rollback

If a production APK is broken and you can't fix it fast:

1. Find the previous production APK in EAS build history (`eas build:list`)
2. Download and reinstall on parents' phones
3. Fix the bug in DEV properly, then go through full release process

---

## Files Reference

| File | Purpose |
|------|---------|
| `.env.development` | DEV Firebase keys (local only, not in git) |
| `.env.staging` | Staging Firebase keys (local only, not in git) |
| `.env.production` | Production Firebase keys (local only, not in git) |
| `.env.*.example` | Templates for above — these ARE in git |
| `app.config.js` | Dynamic Expo config — reads `APP_ENV` |
| `eas.json` | EAS build profiles |
| `scripts/generate-icons.js` | Creates placeholder icon PNGs |
| `assets/icon-dev.png` | Orange icon for DEV APK |
| `assets/icon-staging.png` | Amber icon for Staging APK |
| `assets/icon.png` | Green icon for Production APK |
| `test-cases.md` | Full test suite to run in staging |
| `LAUNCH-CHECKLIST.md` | Pre-launch security + bug audit results |
