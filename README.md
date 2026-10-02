# Trysee

- `extension/` – Chrome extension: live camera in a movable/resizable widget; drop a product image to try it on (live video or photo)
- `supabase/` – the backend: Edge Function + Postgres schema (passes, Decart live + photo try-on, email + password accounts, one-time pass top-ups via Polar / Stripe)
- `server/` – local dev server + tests (Node 22+). Production backend is in `supabase/`
- `site/` – landing page, example store, privacy + terms
- `scripts/package-extension.ps1` – builds the Chrome Web Store zip

**Live mode** (default): your camera is shown live in the widget. Dropping a product starts a Decart `lucy-vton-3.5` realtime
session (WebRTC, runs inside the camera iframe) with the garment as the reference image, and it swaps the clothing while keeping
your face unchanged. Dropping another product while live swaps the outfit for free. **1 pass = 1 live session of `LIVE_SECONDS` (15s) or 1 photo.** Passes are bought as one-time top-ups and belong to the user's account (sign in on any browser).
**Photo mode**: captures one frame and edits it with `lucy-image-2` (+ `reference_image`). 1 pass per image.
The browser never gets your Decart key: the server mints a short-lived token limited to the try-on model and session length.
A pass is refunded if a live session never connects or an image edit fails.

## Local development
1. `cd server`, copy `.env.example` to `.env`, set `DECART_API_KEY`, then `npm install && npm start` (same code as production, embedded Postgres, no Docker)
2. `cd extension && npm install && npm run build` (bundles the Decart SDK into `camera.js`; re-run after editing `src/camera.js`)
3. `chrome://extensions` -> Developer mode -> Load unpacked -> `extension/`. In the extension popup -> Advanced, set the server URL to `http://127.0.0.1:8787` while developing locally (the default points at the Supabase function)
4. Serve `site/` (`python -m http.server`) and open `example.html`
5. `cd server && npm test` runs the integration tests (passes, webhooks, idempotency, refunds, production guards)

## Production
The backend runs on **Supabase** (Edge Function + Postgres), see `supabase/README.md`. The website in `site/` is static, host it anywhere.
Chrome Web Store zip: `powershell -File scripts\package-extension.ps1 -ServerUrl https://kgxklwpqcropiprelklc.supabase.co/functions/v1/trysee`,
then upload `dist/trysee-<version>.zip` and bump `version` in `extension/manifest.json` for every update.
