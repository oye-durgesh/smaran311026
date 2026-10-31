# Smaran

Voice-first family health companion. The running production frontend is the root Vite + React app (`src/`, 46 screens). A linked Supabase project stores family data when public env vars are set. With no credentials the app stays in the browser on **DEMO DATA**.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run preview
```

Do not start the archived `app/` tree for day-to-day use. `app/`, `project/`, and `chats/` are kept as design history.

## Demo mode (default)

Leave `.env.local` empty (or omit `VITE_SUPABASE_*`). Data stays in `localStorage`. Settings → **Demo tools** → **Reset demo data** restores the labelled demo family. Demo-flagged rows are never uploaded.

## Supabase (existing project)

Project URL: `https://oqcfpdfhtwvpirhcusbi.supabase.co` (Mumbai / `ap-south-1`).

1. Copy `.env.example` to `.env.local` and set only:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Apply migrations with `npx supabase db push` (already applied on the linked project).
3. Sign in from **Create your account** using email and password. Row Level Security keeps rows where `owner_id = auth.uid()`.
4. App tables: `profiles`, `family_members`, `medicines`, `medicine_schedules`, `health_readings`, `member_appointments`, `member_reminders`.
   Older `appointments` / `reminders` tables from a previous schema are unused by this frontend.

Never put a service-role key in frontend code, `VITE_*` variables, or Vercel.

## ElevenLabs (Mother and Father)

Private secrets belong only in Supabase Edge Function secrets (`supabase/.env.example`):

```
ELEVENLABS_API_KEY=
ELEVENLABS_MOTHER_AGENT_ID=
ELEVENLABS_FATHER_AGENT_ID=
```

The current project also has legacy names `MUMMY_ELEVENLABS_AGENT_ID` and `PAPA_ELEVENLABS_AGENT_ID`. The `elevenlabs-session` function accepts either pair.

The browser sends only a family-member id. The function chooses Mother’s or Father’s agent from `family_members.relationship` and returns a short-lived signed URL. The API key never ships in the frontend.

If those secrets are missing or rejected, the on-screen Sathi call falls back to the local simulation (or shows the server error when a live session was requested).

Deploy the function:

```bash
npx supabase functions deploy elevenlabs-session --use-api --yes
```

## Vercel (not deployed from this workspace yet)

- Framework: Vite
- Root directory: repository root
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: `vercel.json` rewrites `/(.*)` → `/index.html`

Set on Vercel (Production):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Do not set `ELEVENLABS_API_KEY` or the Supabase service-role key on Vercel.

## Layout

```
src/                 production frontend (screens, store, navigation)
src/services/        storage, domain services, optional Supabase + ElevenLabs adapters
supabase/            schema + elevenlabs-session Edge Function
app/                 archived previous frontend
project/             original design files
chats/               design transcripts
```
