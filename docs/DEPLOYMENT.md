# Deployment: Supabase (backend) + Vercel (website)

Smaran is two parts. **Vercel hosts only the static website** (`app/`, built by Vite). **Everything private lives in Supabase**: the database, login, file storage, the Edge Functions that talk to Sarvam and ElevenLabs, and the scheduler. Vercel never sees a private key.

Nothing in this repository has been deployed. These are the steps to do it.

## 1. Environment variables (names only; never commit values)

| Where | Name | Needed? | Notes |
|---|---|---|---|
| Vercel (public, shipped to the browser) | `VITE_SUPABASE_URL` | required | Project URL from Supabase → Settings → API |
| Vercel | `VITE_SUPABASE_ANON_KEY` | required | the **anon / publishable** key. Never the service-role key |
| Vercel | `VITE_VAPID_PUBLIC_KEY` | for push when the app is closed | `npx web-push generate-vapid-keys` |
| Vercel | `VITE_SUPPORT_EMAIL` | optional | shown behind "Contact support"; leave empty to hide |
| Vercel | `VITE_LOCAL_API` | **leave unset** | only for `npm run dev:api` on your own computer |
| Supabase secrets | `SARVAM_API_KEY` | prescription reading | |
| Supabase secrets | `ELEVENLABS_API_KEY` | spoken replies and live agent | |
| Supabase secrets | `ELEVENLABS_API_KEY` | all ElevenLabs calls | ONE shared key (both agents are in the same workspace). Secret |
| Supabase secrets | `MUMMY_ELEVENLABS_AGENT_ID` | Mummy's live conversation | Mummy's own agent; see `ELEVENLABS_AGENT.md` |
| Supabase secrets | `PAPA_ELEVENLABS_AGENT_ID` | Papa's live conversation | Papa's own agent. Must differ from Mummy's |
| Supabase secrets | `ELEVENLABS_VOICE_ID` | optional default voice | used only when the speaker is not Mummy or Papa |
| Supabase secrets | `ELEVENLABS_MOM_VOICE_ID`, `ELEVENLABS_DAD_VOICE_ID` | unused for reminder TTS | do **not** put Agent IDs here; Mummy/Papa voices come from each agent’s dashboard Voice setting |
| Supabase secrets | `ELEVENLABS_AGENT_USES_CLONED_VOICE` | optional | set `true` only if the agents use cloned voices; licensed library voices do not need this |
| Supabase secrets | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | push | subject like `mailto:you@example.com` |
| Supabase secrets | `CRON_SECRET` | scheduler | long random string; also stored in Postgres for pg_cron (step 4) |
| Supabase secrets | `ALLOWED_ORIGIN` | production | your Vercel URL, e.g. `https://smaran.vercel.app` |
| Supabase secrets | `SARVAM_BASE_URL`, `SARVAM_DOC_JOB_PATH`, `ELEVENLABS_BASE_URL`, `ELEVENLABS_MODEL_ID` | optional | defaults are correct; `*_BASE_URL` exist for tests |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions by Supabase automatically. The service-role key is used only by the scheduler function.

## 2. Supabase project

```bash
npm i -g supabase            # or use npx supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push             # applies supabase/migrations/*.sql in order (10 files)
```

Migrations, in order: `…01_schema` (tables + RLS), `…02_dispatch` (recurrence + atomic claiming + retry), `…03_cron_storage` (cron + private `prescriptions` bucket), `…04_extraction_jobs`, `…05_care_recipients` (family profiles, person_id on every record), `…06_reminder_tool` (source/created_by/delivery_channel, audit insert), `…07_stock_documents`, `…08_medicine_details`, `…09_invitations_scope`, `…10_reminder_skipped`. Never edit tables by hand; add a new migration.

Auth settings (Dashboard → Authentication):
- **Email** provider on, **Confirm email** off (immediate session after signup), minimum password length 8.
- **URL configuration**: Site URL = your Vercel URL; add the same URL (and `http://localhost:5173` for development) to Redirect URLs. The verification and password-reset links return there.
- **Phone** provider: off. A phone number is never a sign-up credential.
- Set up an SMTP sender for production; Supabase's built-in email is rate-limited and meant for testing only.

`supabase/config.toml` already records these settings for the local CLI.

## 3. Secrets and functions

```bash
cp supabase/.env.example supabase/.env.local     # fill in; this file is git-ignored
supabase secrets set --env-file supabase/.env.local
supabase functions deploy extract-prescription extraction-job reminders tts elevenlabs-session dispatch-reminders
```

## 4. Scheduler

`dispatch-reminders` runs every minute from pg_cron (migration 03). Set the two Postgres settings it needs (SQL editor): the function URL and the same `CRON_SECRET`. See `docs/BACKEND_SETUP.md` § "Secrets and functions". The function rejects any call without the secret header.

## 5. Vercel

1. Import the repository. **Root Directory: `app`**. Framework: Vite. Build command `npm run build`, output `dist`.
2. Add the four `VITE_*` variables above for Production and Preview.
3. Deploy. The app uses hash routes (`#14`), so no rewrite rules are needed.
4. Back in Supabase, put the final Vercel URL into the Auth redirect list and `ALLOWED_ORIGIN`.

## 6. After deploying

Run the checklist in `docs/LIVE_VERIFICATION.md`. Until it has been run against your real accounts, treat Sarvam, ElevenLabs, email delivery and push as **unverified**.
