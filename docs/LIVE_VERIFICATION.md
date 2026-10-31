# Live verification: what to run against your real accounts

Automated tests in this repository use **mocks and an in-memory Postgres** (PGlite). They prove our logic and our database rules. They do **not** prove that Supabase email, Sarvam, ElevenLabs, push notifications or your phone behave. Run these once, tick each box, and only then call an integration "verified".

Prerequisites: `docs/DEPLOYMENT.md` done (migrations pushed, secrets set, functions deployed, Vercel or `npm run dev` pointing at the project).

## A. Supabase: email accounts
- [ ] Sign up with a real email and a password of 8+ characters. A verification email arrives (check spam).
- [ ] Before clicking the link, "I have verified my email" says it has not seen the verification.
- [ ] Click the link. You land in the app signed in and continue to Language.
- [ ] Sign out (More → Sign out), sign in again with the password. Refresh the page: still signed in.
- [ ] "Forgot password?" sends a reset email; the link opens "Choose a new password"; the new password works.
- [ ] SQL editor: `select id, email from auth.users;` shows your user. `select * from care_recipients;` shows your own profile after the first sync.

## B. Family profiles and isolation
- [ ] Choose "Helping a parent", add Mummy, then add Papa from Home. In SQL: two `care_recipients` rows with different ids.
- [ ] Add a medicine for each. SQL: `select name, person_id from medications;` shows each under the right profile.
- [ ] Create a second test account (another email). It must see **no** rows from the first: `select count(*) from medications;` as that user returns 0.

## C. Invitations
- [ ] Home → Family Space → Invite. Enter the second account's email, pick one profile, "Create invitation", open the link in a private window signed in as the second account, Accept. It now sees only that profile.
- [ ] Open the link signed in as a third account: "sent to a different email address".
- [ ] Revoke from the first account: the second account loses access immediately.

## D. Sarvam prescription reading (real)
- [ ] From `app/`: `SARVAM_API_KEY=… npm run sarvam:smoke -- path/to/prescription.pdf hi-IN` prints the job id, polling states and the parsed medicines. Use your own sample document, not a real patient's.
- [ ] In the app: open a profile → Upload prescription → choose a PDF/PNG/JPG → pick the language → Read. Progress appears; Review shows what was read next to "Compare with original text"; uncertain fields are marked; nothing is active.
- [ ] Upload the same file again for the same person: "already uploaded". Upload it for the other person: allowed.
- [ ] SQL: `select status, error_code from extraction_jobs order by created_at desc limit 5;` and `select document_type, person_id from prescription_documents;`.
- Note: prescription reading uses `POST /doc-ai/v1/job/extract` (Document Intelligence Extract), then `GET .../results`. Parse/digitise are not used unless `SARVAM_DOC_JOB_PATH=parse`.

## E. Reminders (the acceptance criterion)
- [ ] Open Talk to Sathi as Mummy (her profile active). Say or type: "Remind me to go for a walk at 6 PM" (use a time a few minutes ahead for the test).
- [ ] Sathi confirms **only after** the tool answers SAVED. SQL: `select title, person_id, scheduled_for, time_zone, status, source, idempotency_key from reminders order by created_at desc limit 3;` shows it under Mummy, in her time zone, `source = 'agent'` or `'voice'`.
- [ ] Turn the server down (or revoke your session) and ask again: Sathi must say it was NOT saved.
- [ ] Repeat the identical request: no second row.
- [ ] Allow notifications and install the app (Add to Home Screen on iOS). At the time, a push arrives titled "Mummy: Go for a walk". SQL: `select channel, outcome, at from delivery_attempts order by at desc limit 5;` shows `server-push / delivered`.
- [ ] A delivered push is **not** proof the person heard it. Open it, tap Answer; only "Ho gaya" marks it `completed` with `completion = user-reported`.
- [ ] Daily: "Remind Mummy every day at 6 PM to go for a walk". A `reminder_series` row exists and tomorrow's occurrence appears (`select * from reminders where series_id is not null`). No duplicates after a second scheduler run.
- [ ] Scheduler: Dashboard → Edge Functions → `dispatch-reminders` → logs show one run per minute; calling it without `x-cron-secret` returns 401.

## F. ElevenLabs (real)
- [ ] `ELEVENLABS_API_KEY`, `MUMMY_ELEVENLABS_AGENT_ID`, `PAPA_ELEVENLABS_AGENT_ID`, `ELEVENLABS_VOICE_ID` set. Settings → "Use Sathi's server voice" on: a reply plays in the voice you configured.
- [ ] Set Mom/Dad voice IDs. On Mummy's page choose Mom; speak; compare the audio with the voice in the ElevenLabs dashboard. Switch to Dad and repeat. Remove `ELEVENLABS_DAD_VOICE_ID` and choose Dad: you must see a clear message and hear the browser voice, never Mom's.
- [ ] Live agent: enable "Live conversation (beta)". Start a conversation: it connects. Ask for a reminder: the `create_reminder` tool runs (visible in the agent's conversation log).
- [ ] Mom/Dad on the live agent: confirm the dashboard's Security tab has Voice ID overrides enabled. Without it the session is refused and the app shows the error.
- [ ] Speak English, then Hindi, then English. Sathi answers in the language of each message.
- [ ] An automated test cannot show that the agent follows its prompt. Judge it yourself with the prompt in `ELEVENLABS_AGENT.md`.

## G. Things this repo cannot do
- Wake a locked phone or play audio with the app closed. Web push can show a notification; sound and voice playback need the app open and allowed by the browser.
- Make phone calls. There is no telephony integration.
