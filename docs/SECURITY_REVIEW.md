# Security review (what was checked, what was found)

Scope: this repository as of the last commit. Method: reading the code and SQL, plus the automated tests listed. Not done: a penetration test, a review of a deployed Supabase project, dependency audit of the production build.

## Verified by tests
| Property | How |
|---|---|
| Every table has RLS enabled (and forced where it matters); users read/write only their own rows | `supabase/tests/db.test.ts` on real Postgres semantics (PGlite with a stubbed `auth.uid()`/`auth.jwt()`) |
| A record cannot be attached to another account's family member (composite foreign key), nor moved to another person later (immutable `person_id`) | db tests |
| Reminders must match their medicine's and series' person | db tests |
| Duplicate profiles and duplicate reminders are impossible (unique indexes / idempotency key) | db tests, reminder-tool tests |
| Invitations: email-bound, single use, expiring, scoped to chosen profiles; members cannot promote themselves or widen scope; revocation is immediate and audited | db tests |
| Family helpers do not see medical documents; readings need their own permission | db tests |
| Audit log: users can add entries about their own account, cannot edit or delete them | db tests |
| The model cannot choose the user or the owner; a person that is not yours or is archived is refused | reminder-tool tests |
| "Saved" is reported only after the backend confirms; failures are "NOT SAVED" | agent-tools + reminder-tool tests |
| Mom/Dad voices map to separate variables, need consent, never fall back to another voice | voices tests |
| Lock-screen text contains no medicine name | dispatch-payload tests |
| The Sarvam key is never sent to the download URL; the app never sees it | sarvam tests |

## Secrets
- `SUPABASE_SERVICE_ROLE_KEY` is read in one function only (`dispatch-reminders`, protected by `x-cron-secret`, compared in constant time). No `service_role` string exists under `app/src`.
- Browser code uses only `VITE_*` values. `.gitignore` excludes `.env*` except the `.example` files.
- Provider keys (`SARVAM_*`, `ELEVENLABS_*`) are read only inside Edge Functions or the local dev server (`127.0.0.1` only, non-localhost Host headers refused).
- Function logs contain fixed strings only; document text, transcripts and keys are never logged.

## Findings (open)
1. **Browser storage is not encrypted.** The offline-first store keeps health data in `localStorage` and prescription files in IndexedDB on the device. Anyone with access to an unlocked browser profile can read them. Mitigation: use device lock; "Remove data" wipes it. Not fixed.
2. **No server-side rate limiting** beyond the providers' own limits. A signed-in user could call `reminders`, `tts` or `extract-prescription` repeatedly. Add Supabase/edge rate limiting before public launch. `tts` caps text at 600 characters; uploads cap at 10 MB.
3. **`ALLOWED_ORIGIN` defaults to `*`.** Authentication still requires a JWT, but set it to the production origin.
4. **RLS was tested in PGlite, not on a live Supabase project.** Real `auth.uid()` and storage policies were stubbed or not exercised. Run `LIVE_VERIFICATION.md` §B–C.
5. **Storage:** the `prescriptions` bucket is private with folder-per-user policies (migration 03). Signed-URL download of stored originals is not yet exposed in the UI; uploaded originals are kept until the account is deleted. A retention/deletion job is not implemented.
6. **Data export and account deletion are not implemented as a one-tap workflow.** "Privacy & data" offers local removal. Server deletion cascades from `auth.users` if you delete the user in the dashboard.
7. **Email enumeration:** sign-up for an existing address returns the same "check your email" screen (Supabase behaviour); password reset shows the same message either way. Good. Sign-in errors are generic.
8. **Voice cloning is not implemented** (explicitly deferred). The Mom/Dad mapping only selects voices you have already configured; nothing records a voice. Consent is a flag (`voice_cloning_consent`) on the profile.
9. **Notification payloads** name the person (e.g. "Time for Mummy's medicine") but never the medicine. Custom reminder titles you typed are shown as typed.
10. **Dependencies:** `npm audit --omit=dev` reported two production issues (`fflate` ZIP64 parser can loop forever on a malformed archive; `@supabase/auth-js` path routing). Both were fixed by updating (`fflate` 0.8.3, `supabase-js` 2.118; the Edge Functions import `npm:fflate@0.8.3`) and the production audit is now clean. `npm audit` still lists 6 findings in **development tooling only** (vite, esbuild, vitest and friends). They affect a developer's local dev server, not the deployed site, and need major-version upgrades (`npm audit fix --force`), which were not applied.

## Not claimed
Compliance with any health-privacy law, medical-device status, or clinical safety. Smaran records and reminds; it does not diagnose, dose, order or change treatment.
