# Signal Dashboard — Frontend (v3.1, vanilla)

Static dashboard. No build step. Auth via Supabase; all data comes from the backend
(`/api/*`) — no third-party keys live in the browser.

## Run tests
`cd frontend && npm install && npm test` (vitest + jsdom — unit tests for `auth.js` and `api-client.js`).

## Go live (Supabase setup)
1. Create a Supabase project. From **Settings → API** copy the **Project URL**, the **anon public key**, and the **JWT secret**.
2. Set the backend `SUPABASE_JWT_SECRET` (in `backend/.env`) to that JWT secret so the backend accepts tokens this project issues.
3. `cp js/config.example.js js/config.js` and fill `supabaseUrl`, `anonKey`, and `apiBaseUrl` (the backend origin, e.g. `http://localhost:3000`).
4. In Supabase → Authentication, create the ≤5 user accounts manually and **disable self-signup**.
5. Serve the folder with any static server (e.g. `npx serve frontend`) and open it; the backend must be running.

## Notes
- `js/config.js` is gitignored (only `config.example.js` is committed).
- The DexScreener chart is a keyless public embed and is intentionally kept.
- Portfolio (F4) and signal scores (F5) UI are completed in Phase 3b.
