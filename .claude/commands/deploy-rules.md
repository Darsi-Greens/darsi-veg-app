---
description: Deploy Firestore security rules to a chosen env (dev/staging/shop) with safety guardrails
argument-hint: dev | staging | prod
allowed-tools: Bash(npx firebase*), Bash(cd*), Read, Grep
---

You are deploying `darsi-veg-backend/firestore.rules` to a Firebase project. The target env is: **$ARGUMENTS** (one of: dev, staging, prod).

Map env → project id:
- `dev` → `darsi-veg-dev`
- `staging` → `darsi-veg-staging`
- `prod` → `darsi-veg-shop`

Follow these steps and DO NOT skip the safety checks:

1. **Read the rules first.** Open `darsi-veg-backend/firestore.rules`. Confirm it requires `request.auth != null` (the `signedIn()` helper). If it does, the deployed app MUST sign in (Anonymous Auth) or it will lose all DB access.

2. **Anonymous-auth prerequisite.** Remind the user: the Anonymous sign-in provider must be enabled in the target Firebase project's Authentication settings, or every request will fail with `permission-denied`.

3. **PROD guardrail (critical).** If the target is `prod` (`darsi-veg-shop`):
   - Confirm with the user that a **production APK built from the current code (with anonymous auth) is already shipped/installed**. If the live PROD app predates the anon-auth code, these rules will lock it out.
   - If that's not confirmed, STOP and recommend deploying to `staging` first and/or building a new PROD APK before deploying rules.
   - Always require an explicit "yes, deploy prod" from the user.

4. **STG-first nudge.** If deploying to `prod`, confirm `staging` was already deployed and verified.

5. **Deploy.** From the backend dir, run:
   ```
   cd darsi-veg-backend && npx firebase deploy --only firestore:rules --project <project-id>
   ```
   - Use `--only firestore:rules` (never bare `deploy`).
   - Always pass `--project` explicitly so the wrong env can't be hit.
   - If the Firebase CLI login fails (a known flaky issue on Windows), tell the user to publish via the Firebase Console instead: Firestore → Rules → paste `firestore.rules` → Publish.

6. **Verify.** After deploy, tell the user to confirm in the running app that the sync dot stays green (writes succeed) — a red dot or `permission-denied` means anonymous auth isn't attaching.

Report exactly what was deployed and to which project.
