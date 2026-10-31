# Sarvam Document Intelligence Extract: prescription reading

## What the code does (matches the current official Extract API)
1. The browser uploads the file to the `extract-prescription` Edge Function (or the local dev API). Allowed: PDF, PNG, JPG/JPEG, up to 10 MB. Extract allows up to 20 pages.
2. The function checks the signed-in user and that the chosen family member belongs to that account, rejects a file already uploaded for that person, stores the original in the private `prescriptions` bucket, and creates a Sarvam **Extract** job: `POST {base}/doc-ai/v1/job/extract` (multipart: `file`, `schema` as a JSON string, `language` as a BCP-47 code such as `hi-IN` / `en-IN`, `output_format=json`), header `api-subscription-key`.
3. The browser polls `extraction-job` with exponential backoff for up to about 150 seconds; the function polls `GET /doc-ai/v1/job/{id}/status`. States handled: pending, running, completed, partially completed, failed, rejected; 429/503 keep waiting; a job older than 10 minutes becomes "timed out".
4. When complete, `GET /doc-ai/v1/job/{id}/results` returns `{ result, annotations }`. `annotations` mirrors `result`; each leaf has `confidence` and `sources`. The API key never goes to the browser.
5. Mapped fields: patient name, doctor name, prescription date, per-medicine name/strength/dosage/frequency/intake timing/food/duration/instructions/unclear text. Empty values stay empty and are flagged. Low confidence (`< 0.7`) is flagged. Nothing is invented.
6. Review screen: every field is editable; extracted header + original field text can be compared; nothing is active until the user confirms and activates.
7. Cancel only stops tracking. Sarvam has no documented cancel call.

## Configure
- Production: `supabase secrets set SARVAM_API_KEY=…` (see `DEPLOYMENT.md`). Optional: `SARVAM_BASE_URL`, `SARVAM_DOC_JOB_PATH` (leave unset; default is `extract`).
- Local, no Supabase: `cp app/.env.server.example app/.env.server.local`, set `SARVAM_API_KEY`, then in two terminals `cd app && npm run dev:api` and `VITE_LOCAL_API=true npm run dev`. The key stays in the Node process; the browser only talks to `127.0.0.1`.
- Real-key check without the UI: `cd app && SARVAM_API_KEY=… npm run sarvam:smoke -- path/to/file.pdf hi-IN`.

## Status
Verified against a **fake Sarvam Extract server** that follows the documented protocol (`supabase/tests/sarvam.test.ts`). Not claimed live until deployed and run against the real API.
