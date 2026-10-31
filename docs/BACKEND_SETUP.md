# Backend setup (Supabase, Sarvam, ElevenLabs, Web Push)

Nothing here is required to try the app: with no `VITE_SUPABASE_*` variables it runs in **local demo mode**.
This guide turns on the real backend. All private keys stay in Supabase **function secrets**; the browser only ever
holds the public anon key and the public VAPID key.

## What runs where

| Capability | Where | Needs |
|---|---|---|
| Accounts (email + password) | Supabase Auth | Email provider on, Confirm email off so signup can sign in immediately. SMTP still needed for password reset. Phone sign-up is off |
| Data + Row Level Security | Postgres (`supabase/migrations`) | `supabase db push` |
| Scheduled delivery (app closed) | pg_cron → `dispatch-reminders` → Web Push | VAPID keys, `CRON_SECRET`, pg_cron/pg_net |
| Prescription reading | `extract-prescription` → Sarvam Document AI | `SARVAM_API_KEY` |
| Sathi's server voice | `tts` → ElevenLabs | `ELEVENLABS_API_KEY`, `MUMMY_ELEVENLABS_AGENT_ID`, `PAPA_ELEVENLABS_AGENT_ID` (Voice ID is read from each agent). Optional `ELEVENLABS_VOICE_ID` for default/self |
| Live conversation (beta) | `elevenlabs-session` (signed URL) → `@elevenlabs/client` | two ElevenLabs agents + `MUMMY_ELEVENLABS_AGENT_ID` / `PAPA_ELEVENLABS_AGENT_ID` + one `ELEVENLABS_API_KEY` |

> Start with `docs/DEPLOYMENT.md` (the current end-to-end guide, including Vercel). This file is the original background reference; where they differ, `DEPLOYMENT.md` wins.

## 1. Create the project and apply the schema
```bash
npm i -g supabase            # or use npx supabase
supabase login
supabase link --project-ref <project-ref>
supabase db push             # applies supabase/migrations/*
```
In the dashboard enable **Database → Extensions → pg_cron and pg_net**. Then, once, in the SQL editor:
```sql
alter database postgres set app.settings.functions_url = 'https://<project-ref>.supabase.co/functions/v1';
alter database postgres set app.settings.cron_secret   = '<same random string as CRON_SECRET>';
```

## 2. Auth
Authentication → Providers → **Email**: on, "Confirm email" off, minimum password length 8. Authentication → URL
configuration: Site URL and Redirect URLs = your app's URL (verification and password-reset links return there).
Leave **Phone** off. Configure SMTP for production (the built-in sender is for testing and is rate-limited).

## 3. Secrets and functions
```bash
npx web-push generate-vapid-keys            # copy the public + private key
cp supabase/.env.example supabase/.env.local   # fill it in (this file is git-ignored)
supabase secrets set --env-file supabase/.env.local
supabase functions deploy dispatch-reminders extract-prescription elevenlabs-session tts
```

## 4. Frontend
```bash
cp app/.env.example app/.env.local   # set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_VAPID_PUBLIC_KEY
cd app && npm run dev
```
Hosting must be **HTTPS** (service workers / push do not work on plain http except localhost).

## ElevenLabs agent (live conversation, beta)
Create a **private** agent (signed URLs required). Suggested configuration:
* **System prompt**: "You are Sathi, a warm AI companion for an older adult. Always say you are an AI if asked. You never diagnose, never recommend or change medicines or doses, and never claim a medicine was taken unless the user says so. Speak simply, in the user's language ({{language}}), addressing them as {{user_name}}. For a reminder call about {{reminder_title}}, ask whether they took it. Before saving any health reading, read it back and wait for a clear yes."
* **Client tools** and the system prompt: see `docs/ELEVENLABS_AGENT.md` (the current, complete list: `create_reminder`,
  `list_todays_reminders`, `snooze_reminder`, `reschedule_reminder`, `cancel_reminder`, `complete_reminder`, `skip_dose`, `save_health_reading`).
* Enable the client events you use (transcripts, mode changes) under the agent's *Advanced* tab.
* Dynamic variables used: `user_name`, `person_label`, `relationship`, `default_language`, `time_zone`, `speaking_speed`, `reminder_title`, `account_holder`.

## Voices, consent and disclosure
* Mummy and Papa reminder speech uses the Voice already set on that person’s conversational agent. Cloning consent is required only for cloned voices (or when `ELEVENLABS_AGENT_USES_CLONED_VOICE=true`), not for ordinary licensed library voices. A missing agent or Voice setting is an error; it never falls back to the other parent.
* This repo does **not** clone voices. It selects voices that already exist in your ElevenLabs account. Recording and cloning a voice is not built.
* Sathi is always labelled an AI companion in the UI, and server audio carries `x-ai-voice: true`.
* Voice recordings are not stored; only short conversation summaries (switchable) are kept.

## Security notes
* RLS is on (and forced) for every table; policies are covered by `supabase/tests/db.test.ts` (run with `npm test` in `app/`).
* The service role key is only used inside `dispatch-reminders`; app users cannot call the scheduler functions.
* Push payloads are generic ("Time for your medicine") so medicine names do not appear on lock screens.
* Logs avoid health values and transcripts; `audit_logs.detail` is capped and contains no health data.

## Known limits
* **Family sharing across devices is not wired in the UI.** The schema, invite acceptance and approval functions and RLS are
  implemented and tested, but the app still keeps invitations/proposals on the device.
* Sync is last-write-wins per row (first sign-in: server rows win when the device is empty). No offline conflict merge.
* The ElevenLabs agent path and Sarvam extraction are implemented against their current public APIs but were not run against
  live accounts here; verify with your keys before relying on them.
