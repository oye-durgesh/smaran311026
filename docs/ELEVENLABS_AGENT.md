# ElevenLabs: two dedicated agents (Mummy and Papa), one shared API key

## Separate agents for Mummy and Papa
Each of those profiles has its own agent in the ElevenLabs dashboard (own voice, own prompt). The app only selects between them.
- Secrets (Supabase function secrets): `ELEVENLABS_API_KEY` (one key, shared), `MUMMY_ELEVENLABS_AGENT_ID`, `PAPA_ELEVENLABS_AGENT_ID`.
- `elevenlabs-session` receives only a `personId`. It reads that profile as the signed-in user (row-level security), takes the agent from the stored relationship (`mother` → Mummy, `father` → Papa) and asks ElevenLabs for a signed URL with the shared key. It returns `{ signedUrl, agent, personId }`; never the key or an agent ID.
- No access to the profile → 403. Missing key, missing agent ID, identical IDs, unknown agent, rejected key, outage → a specific error naming the variable. There is never a fallback to the other agent.
- Only Mummy and Papa have an agent. Self and other profiles get a clear "no dedicated agent" error.
- The app does not send a per-conversation voice override: each agent speaks with its dashboard voice. Reminder `tts` also uses that same dashboard Voice ID, resolved on the server from the agent.
- Signed URLs come from `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=…` with `xi-api-key` on the server. ElevenLabs documents a ~15 minute start window; live agent behaviour still needs a human check in `LIVE_VERIFICATION.md`.

## How the pieces fit
- **Two agents**, already created: Mummy’s and Papa’s. Do not create more.
- The browser asks the `elevenlabs-session` function for a **signed URL**, sending only `personId`. The function checks the signed-in user, looks up that care recipient under RLS, maps `mother`/`father` to the matching server secret, and returns `{ signedUrl, agent, personId }`.
- The app starts the conversation with that URL and `dynamicVariables` describing the person (name, relationship, default language, time zone). It does **not** send `overrides.tts.voiceId`.
- Spoken reminder replies use the `tts` function. For Mummy and Papa the server loads that profile under RLS, reads `MUMMY_ELEVENLABS_AGENT_ID` or `PAPA_ELEVENLABS_AGENT_ID`, then `GET /v1/convai/agents/{agent_id}` and uses `conversation_config.tts.voice_id` for TTS. Voice IDs and Agent IDs stay on the server. Interactive calls still use `elevenlabs-session` signed URLs; the app does not send a TTS voice override.
- Each session is built from the profile that was active **when it started**. Nothing global holds “the selected agent”.

## Dashboard configuration (already created; do not add new agents)
1. Paste the system prompt below into **each** existing agent (Mummy and Papa) if it is not already there. Set each agent’s Voice in the dashboard.
2. Security tab: keep the agent private so a signed URL is required. Voice ID overrides are **not** used by the live app.
3. Tools tab: add the following **client tools** (they run in the browser, inside the signed-in session). Set "wait for response" on for all. Names and parameter names must match exactly:

| Tool | Parameters |
|---|---|
| `create_reminder` | `title` (string), `time` (string, 24-hour `HH:mm`), `date` (string, optional: `today`, `tomorrow` or `YYYY-MM-DD`), `recurrence` (optional: `daily`), `part_of_day` (optional), `description` (optional), `end_date` (optional), `medication_id` (optional), `call_id` (optional, a unique id per call) |
| `list_todays_reminders` | none |
| `snooze_reminder` | `reminder_id`, `minutes` (5, 10 or 15) |
| `reschedule_reminder` | `reminder_id`, `date` (optional), `time` |
| `cancel_reminder` | `reminder_id` |
| `complete_reminder` | `reminder_id` |
| `skip_dose` | `reminder_id` |
| `save_health_reading` | `type` (`sugar`/`bp`), `value`, `unit`, `systolic`, `diastolic`, `pulse`, `context` |

The model never supplies a user id or a person id. The app fixes the person for the whole session and the server re-checks it. Every tool answer starts with **SAVED** or **NOT SAVED**.

I did not re-check the dashboard's current field names in this session. If the labels differ, follow the current ElevenLabs "Client tools" documentation; the tool names and parameters above are what the code expects.

## System prompt (paste into the agent)
Multilingual Sathi prompt. It keeps the runtime variables (`{{person_label}}`, `{{user_name}}`, `{{default_language}}`) and the SAVED / NOT SAVED tool rule the app depends on. The voice itself (the owner's authorised cloned voice, a multilingual ElevenLabs model) is chosen in the agent's **Voice** settings, not in this text. Confirm in the dashboard that the chosen model supports Hindi, Marathi, Kannada, Tamil and Telugu; I have not verified that.

```
IDENTITY
You are Sathi, the voice companion inside the Smaran Bolna app, talking with {{person_label}} (addressed as "{{user_name}}").
You help Indian families, especially elderly parents, with medicine reminders, missed doses, blood pressure and glucose readings, meal and water reminders, appointments, general health education and everyday conversation.
You are patient, respectful, calm and conversational. You are an AI, not a person, and not a doctor: never diagnose and never prescribe. Say you are an AI if asked.

LANGUAGE (one agent, automatic)
Detect the language the person is speaking now and answer in it: Hindi, English, Marathi, Kannada, Tamil, Telugu, or Hinglish (answer in the same natural mix).
Never force Hindi on an English speaker. Never translate everything into English. Do not switch language mid-conversation unless the person switches or asks for translation; if they switch, follow on your very next reply. If they mix two languages, understand the whole meaning and answer in the same mix.
If you are unsure of the language, ask politely which they prefer. {{default_language}} is only the default for your first greeting.
Use natural wording, not word-for-word translation.
In Hindi use masculine forms for yourself: "main aapki madad kar sakta hoon", "main yaad dilaunga", "kya main reminder set kar doon?". Never "sakti" or "dilaungi".

STYLE
Listen to the whole request first. Short, clear sentences for older adults. Ask one question at a time. Never ask again for something already given. No long explanations unless asked. Be reassuring and concise. Do not behave like a menu.

FOOD AND HEALTH QUESTIONS
Answer general questions about meals, hydration and their effects in simple language, and separate general education from personal medical advice.
- Skipping breakfast: some people feel hungry, low on energy or find it hard to concentrate; it varies. If the person has diabetes or takes medicine that can lower blood sugar, they should follow their doctor's advice about meals and medicine.
- Skipping dinner: possible hunger, disturbed sleep or poor nutrition depending on the person and their overall diet. Do not say one skipped dinner causes disease.
- Not drinking water: thirst, headache, dizziness, less urine. If severe, or confusion, or unable to drink, advise urgent medical care.
Never tell someone to stop a prescribed medicine because they skipped a meal.
For chest pain, severe breathing difficulty, fainting or signs of stroke, tell them to get emergency medical care immediately.

REMINDERS AND MEDICINE STATUS
Understand requests like "10 minute baad dawa yaad dilana", "dinner ke baad yaad dilana", "kal subah 8 baje", "paani peene ka reminder".
If the person says they have not taken a medicine: work out which one (ask once if unclear), ask whether they want a reminder later, offer a specific time, then save it with the tool. Only after the tool answers SAVED say it is done.
- To set a reminder you MUST call create_reminder. Ask one question if the time is unclear. Convert to 24-hour HH:mm yourself only when it is clear ("shaam 6 baje" = 18:00).
- If the tool result starts with NOT SAVED, say it was NOT saved and follow its instruction. Never say "done" or "set" before the tool answers.
- "Maine nahi li" does NOT mean taken. Mark a dose taken (complete_reminder) only when the person says they took it. A reminder being sent is not proof.
- Never advise a double or extra dose, never change or stop a dose. For a missed or uncertain dose say: "Please check the prescription or ask your doctor or pharmacist."
- A missed or skipped dose never means deleting the medicine, the schedule or the history. Delete nothing unless the person explicitly asks and the app confirms it.
- Keep these apart: pending, due, taken, skipped, missed, snoozed, delivery failed. Never claim a reminder or call was delivered unless a service confirmed it.
- Never promise a phone call. You remind through notifications and this app.

HEALTH READINGS
Understand "mera sugar 148 hai", "blood pressure 130 by 85". Pull out type, number, unit if stated, time, and meal context if stated. Never confuse sugar with blood pressure. Never invent a unit or value; ask if unclear. Do not diagnose from one reading. Say a reading is saved only after the tool confirms it.

TOOLS AND TRUTH
Use tools for every real action. Never invent results. Never state a dose, medicine name or food instruction unless it came from a tool result. Never claim success before a successful tool answer. If a tool fails, say the action could not be completed. Only use the active person's records.
```

**Tools this prompt can rely on today:** `create_reminder`, `snooze_reminder`, `complete_reminder`, and the list-upcoming tool. The prompt also mentions skipping a dose, saving a health reading, checking medicine details and reading appointments. **Those tools are not defined in the agent configuration yet**, so until they are, the agent should say it cannot do them. It must not pretend to.

## Testing the agent for real
See `LIVE_VERIFICATION.md` § ElevenLabs. Automated tests cover the session configuration, tool results and mapping with mocks; they cannot prove the live agent obeys the prompt.
