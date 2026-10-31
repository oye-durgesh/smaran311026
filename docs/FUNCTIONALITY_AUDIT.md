# Smaran functionality audit

Framework: React 18 + Vite 5 + TypeScript (`app/`). Run: `cd app && npm install && npm run dev`.
Backup of the pre-functionality state: git tag `pre-functionality-v1` / branch `backup/pre-functionality`.

Baseline (before this work): every screen was static markup. Only CTA/back/tab clicks were handled by one
delegated handler that moved to "screen N+1". No inputs, state, persistence, validation or data sharing.

## Screen inventory (screen → purpose → outgoing actions → controls)

| # | Screen | Outgoing | Interactive controls |
|---|---|---|---|
| 01 | Welcome | 02; account link → Home or 02 | Get Started, "I already have an account" |
| 02 | Account | 01, 03 | back, name, phone, who-for radio (self/parent), Continue |
| 03 | Language | 02, 04 | 4 language options, Continue |
| 04 | Personalization | 03, 05 | text size ×3, speaking speed ×2, reminder tone ×2, call-name chips ×5 (+custom), Continue, Skip |
| 05 | Profile | 04, 06, 24 | name, call-name, language select, time-zone select, invite-family row, Continue |
| 06 | Notifications | 07 | Allow Notifications (browser permission), Not now |
| 07 | Microphone | 08 / Home | Allow Microphone (browser permission), Not now |
| 08 | Upload Rx | 09, 31, Home | upload tile, Camera, Gallery, replace/remove, Skip, Add medicine manually |
| 09 | Processing | 10, 28, 45 | (automatic) runs extraction service |
| 10 | Review medicines | 11, 31, 12 | medicine cards, Review, Add another medicine, Continue, back |
| 11 | Schedule config | 10 / 32 | strength, dose, frequency ×4, time of day ×4, time picker(s), food ×4, duration ×2, Confirm schedule |
| 12 | Finalization | 33, Home | Confirm & activate, Save and finish later, back |
| 13 | Home – setup needed | 30 / 08, 31, 20 | Add medicines, Record a health reading, settings gear, tabs |
| 14 | Home – active | 29, 46, 35/34, 21/22/38, 20 | status card, Talk to Sathi, next reminder, dose cards, record reading, tabs |
| 15 | Medicines | 29, 30, 08 | Active/Completed tabs, + button, medicine cards, Scan another prescription, tabs |
| 16 | Home – missed | 29, 46 | Mark taken, status chips, dose cards, tabs |
| 17 | Incoming call | 34→35, Home | Answer, Not now, Remind me in 15 minutes |
| 18 | Active call | 19 | Mute, Repeat, End (+ text fallback) |
| 19 | Call complete | Home, 15 | Done, View medicines |
| 20 | Health home | 38, 21, 22, 23 | Speak to record, Blood Sugar, Blood Pressure, reading rows, View full history |
| 21 | Blood sugar | 40, 20 | value, unit toggle, context ×3(+2), date/time, note, Edit, Confirm & save |
| 22 | Blood pressure | 40, 20 | systolic, diastolic, pulse, date/time, note, Confirm & save |
| 23 | Health history | 21/22 (edit), delete | filters, chart, reading rows, back |
| 24 | Family space | 41, 43, 42 | Share link, QR code, member rows, back |
| 25 | Appointments | – | + button, appointment cards (view/edit/cancel), past list |
| 26 | Settings | 05, 41, 44, 47, 48, sheets | profile row, 8 setting rows, Sign out |
| 27 | Empty – health | 20 | filter chips, Record a reading |
| 28 | Error states | 08, 31, voice, 24 | Try again, Add manually, 4 status rows |
| 29 | Medicine detail | 32 | Edit schedule, Pause reminders |
| 30 | Medicine setup | 08, 31, 31(dictate) | Scan prescription, Add manually, Tell Sathi |
| 31 | Add manually | 10 / 12 / 30 | name (+dictation), strength, dose, frequency, time, food, duration, Add medicine |
| 32 | Edit medicine | 11, 29 | field rows, Change reminder times, Pause reminders, Remove medicine, Save changes |
| 33 | Setup complete | Home | Hear Sathi say this, Go to Home |
| 34 | Connecting | 35 / 37 | (automatic) |
| 35 | Listening | 36/18, 19 | Mute, End |
| 36 | Sathi speaking | 35, 19 | Mute, Repeat, End |
| 37 | Reconnecting / error | 34, text | Try again, Respond by text |
| 38 | Voice health entry | 40, 39 | transcript (editable), Edit, Confirm & save |
| 39 | Invalid reading | 40 | type chips, value, context, Save reading |
| 40 | Reading saved | 20, 23 | Done, View health history |
| 41 | Invite / permissions | 24 | Copy, permission toggles |
| 42 | Remote setup | 24 | Send for confirmation, propose change |
| 43 | Parent confirmation | 24 | Decline, Approve changes |
| 44 | Privacy | 41, sheets, 01 | toggles, Family access, Voice cloning consent, Delete all my data |
| 45 | Partial extraction | 10, 08 | Review found medicines, Retake photo |
| 46 | Today's reminders | Home | timeline items |
| 47 | Help | – | topic cards, Contact support |
| 48 | Notification permission | 26 | Allow / Enable in Settings |

## Findings (what was missing)
All of the above. Concretely: no shared state, no persistence, no validation, no real file picker, no
browser-permission handling, no reminder model, no voice pipeline, no health store, no family model,
Back always went to "N−1", unreachable states (16, 27, 28, 39, 45, 48) and no way to enter/edit data.

## Implementation order
1. Core: central screen map, persisted store, navigation with history, UI primitives (identical markup).
2. Setup flow (01–12, 30–33, 45, 28) + medicines.
3. Reminder domain (state machine, recurrence, NL parsing, scheduler) + Home/Today/Medicines (13–16, 29, 46).
4. Voice (17–19, 34–37) behind a `VoiceService` interface.
5. Health (20–23, 27, 38–40), Family/Appointments/Settings (24–26, 41–44, 47, 48).
6. Backend (Supabase migrations/RLS/functions, ElevenLabs, Sarvam) – server side, config-gated.
7. Tests + pixel-comparison against the approved design.
