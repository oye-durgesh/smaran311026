# Test report

Everything below was actually run in this repository's last session. **None of it touched a real Supabase project, Sarvam, ElevenLabs, an email
provider or a push service.** "Mock" and "fake" mean exactly that.

## Unit and database tests: `cd app && npm test`
**19 files, 251 tests, 0 failed, 0 skipped.**

| File | Tests | Kind |
|---|---|---|
| `supabase/tests/db.test.ts` | 35 | **Real SQL** on in-process Postgres (PGlite), all 10 migrations applied, stubbed `auth.uid()`/`auth.jwt()`: RLS isolation, family profiles and composite foreign keys, immutable `person_id`, invitations (email-bound, single-use, expiry, scope, no self-promotion, revocation), audit-log rules, stock ledger, documents and duplicate uploads, skipped state, reminder columns, scheduler claiming/idempotency/retry/backoff/expiry |
| `supabase/tests/reminder-tool.test.ts` | 32 | In-memory store (mock of the DB boundary): one-time/daily, time zones, clarification, validation, authorisation, medicine checks, idempotency incl. concurrent retries, DB failure, snooze/reschedule/complete/skip/cancel |
| `supabase/tests/sarvam.test.ts` | 28 | **Fake Sarvam HTTP server** following the documented protocol |
| `supabase/tests/voices.test.ts` | 13 | Fake ElevenLabs: Mom/Dad/default mapping, consent, missing/invalid IDs, API and network failures, agent session |
| `supabase/tests/dispatch-payload.test.ts` | 4 | Push payload (no medicine name) and per-profile notification switch |
| `app/src/domain/__tests__/reminders.test.ts` | 15 | Reminder state machine incl. skip |
| `…/people.test.ts` | 14 | Mummy/Papa separation, scoping, idempotent profile creation, archive, per-person settings, stock actions |
| `…/inventory.test.ts` | 14 | Stock estimate incl. the 42-tablet / 21-day example, thresholds, uncertainty, skipped doses |
| `…/healthcard.test.ts` | 9 | Latest reading, stale labelling, trend rules, follow-up |
| `…/nlp.test.ts`, `brain.test.ts` | 15 + 7 | English/Hindi/Hinglish parsing; voice brain |
| `app/src/voice/__tests__/lang.test.ts` | 11 | Language following (English, Hindi, Hinglish, Marathi, Kannada) |
| `app/src/services/__tests__/*` | 13 + 10 + 9 + 7 + 4 + 4 | extraction client/polling, agent tools (mock backend), invitations (mock client), row mapping, TTS client, agent session config |
| `app/src/dev/__tests__/demoFamily.test.ts` | 7 | Synthetic demo family |

## Type-check and build
`npm run check` = `tsc` on the Edge Functions + the tests above + `tsc` on the app + `vite build`. All succeeded (build ~4 s).
There is **no ESLint** configured, so no lint result exists.

## Browser end-to-end (Playwright, real UI)
| Script | Result | Notes |
|---|---|---|
| `e2e/family-flow.mjs` | 18 pass, 0 fail | both onboarding choices, Mummy/Papa separate, persistence after refresh |
| `e2e/stock-flow.mjs` | 14 pass, 0 fail | medicine details form, stock estimate, refill, alert wording |
| `e2e/demo-flow.mjs` | 19 pass, 0 fail | the stage demo with the synthetic family (demo-mode reader, labelled) |
| `e2e/auth-flow.mjs` | 20 pass, 0 fail | **mocked Supabase Auth** |
| `e2e/sarvam-flow.mjs` | 13 pass, 0 fail | **fake Sarvam server** through the local dev API |
| earlier regression scripts (original flows) | 25 + 44 pass, 0 fail | onboarding → upload → activate → ring → snooze → complete; health; appointments; family; refresh persistence |
| accessibility sweep, original 48 screens | 1,187 controls scanned; only `<option>` items flagged (not tappable targets) | |
| `e2e/a11y-new-screens.mjs` (screens 49, 50, 51, 47, 31, 14, 20, 02) | all pass | labels, names, no horizontal overflow |

## Design fidelity
Screenshots of each of the 48 screens were diffed against the approved design with matching sample data. Static screens are 0.00–0.03%
different. Differences that remain are intended (listed in the README), real data replacing mock values, and randomly assigned medicine
bubble colours. Screen 02 differs by about 1% (email instead of phone); screen 47 by about 2% (More guides); screens 13/14/15/20/46 show a
"Help & support" link when there is room.

## Not verified (needs your accounts or devices)
- Supabase email delivery, verification links, password reset, real RLS with real JWTs, Storage policies, pg_cron, deployed Edge Functions.
- Sarvam on a real document; ElevenLabs voices, the live agent, client-tool registration, Voice ID overrides; Web Push to a real phone.
- Hindi speech recognition quality; iOS notification behaviour; multi-day timing.
See `LIVE_VERIFICATION.md`.
