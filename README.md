# The Agency · AD Arcade / DecryptIT

A custom 5×5 word-deduction party game for 6–30 player phones, with private spymaster keys, connected-operative majority voting, guess banking, clue memory restrictions, host recovery, and best-of series. Static frontend + Cloudflare Worker / SQLite Durable Object.

> **DEPLOYMENT / SAFETY STATUS — NOT READY FOR A LIVE PARTY YET.** Zuko supplied the curated `word-packs.json` (400 Family + 400 NSFW words); validation passes for both lists. The 30 overlapping normalized words between packs are allowed and the server prevents early repeat draws across packs. The Worker has not yet been verified on a real Cloudflare deployment; `frontend/config.js` still requires the live Worker URL. iOS Safari and Android Chrome physical-device acceptance are pending. Simulated protocol tests **do not** count as that sign-off.

## Repository layout

- `frontend/index.html`, `style.css`, `app.js`, `qr.js`, `config.js`: GitHub Pages website, host console, separate read-only TV view and phone interfaces, offline QR generation.
- `worker/index.js`: HTTP/WS transport and Durable Object, hibernatable connections, alarms and server-side authorization.
- `worker/engine.js`: auditable game rules, zero browser dependencies.
- `word-packs.json`: **required input; missing curated data**. JSON object with `family` and `nsfw` arrays, **exactly 400 distinct strings in each**, with no duplicates within either list (the server handles overlapping words across packs). This is imported at build time into the Worker; it is never sent to the frontend.
- `tests/`: deterministic engine tests, emitted-WebSocket anti-leak tests, 25-client full game and benchmark.

## Deployment (in order)

1. **Curated word packs: completed.** Zuko's original `word-packs.json` is checked in (400 Family + 400 NSFW); do not edit or regenerate any entries. `npm test` now includes a production-file integrity check and Mixed Bag boards drawn directly from the curated pack, plus synthetic overlap regression tests. A deployed `/health` endpoint must return `wordPacksReady: true`.
2. Connect Cloudflare and deploy from the repository root:

   ```bash
   npm install
   npx wrangler login
   npx wrangler deploy --config worker/wrangler.jsonc
   ```

   The Durable Object is created by the `new_sqlite_classes` migration in `worker/wrangler.jsonc`. Cloudflare permissions and free-tier availability must be verified for the specific account. Do **not** put Cloudflare secrets in code. Alternatively run GitHub Actions `Deploy Agency Worker` with repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (created for this repository). No deployment is automatic from `main` to avoid unintended Worker release.
3. Copy the actual Worker URL returned by Wrangler (for example, `https://<actual-worker-name>.<actual-account-subdomain>.workers.dev`) into `frontend/config.js` as `window.AGENCY_WORKER_URL` (no trailing slash). Never assume a Worker URL just from its name. The backend restricts website origins to `https://adityasuresh109.github.io`, localhost, or explicit `ALLOWED_ORIGIN` Worker setting.
4. In GitHub **Settings → Pages**, set source **GitHub Actions**. The included `Deploy AD Arcade page` workflow publishes `/frontend` on pushes to main. Use the actual URL reported by that workflow; the expected repository path is `https://adityasuresh109.github.io/DecryptIT/`, but this is **not a claim that Pages is enabled or deployed**.
5. Check `GET <workerURL>/health` returns `wordPacksReady: true`, then run a test party with 6+ phones. Host creates a room, shares QR or six-character code, assigns one spymaster per team, then starts. Host's `OPEN TV` opens the read-only public route `#tv=CODE` separately from the console.

## Local development / verification

`npm test` runs curated production-pack validation and pure game tests, 25-client complete-victory mock WebSocket E2E, audience-filter validation on every emitted snapshot, recovery actions, spymaster/host reconnect, and QR generator unit tests. `npm run load` performs five 25-client full-game mock runs and reports elapsed time. Neither command simulates actual venue Wi-Fi nor makes an external Worker deployment.

The frontend can be visually previewed using a local static server (`python3 -m http.server -d frontend 8000`). To play, a deployed Worker URL and the 800-word pack are required. Refresh/reconnect on the same origin retains the seat token in browser `localStorage`; browsers configured to block storage may not restore a seat automatically, and show a visible warning.

## Wire protocol

**HTTP**: `POST /api/create {mode,bestOf,timer}` → `{code,token}` (host secret); `POST /api/join {code,name,team}` → `{code,token,id}`; same route `{code,token}` reclaims a seat. `GET /health` returns readiness. All HTTP errors use `{error}`.

**WebSocket**: connect `GET /api/socket?code=ABCDEF`; first message `{type:"auth",token}` for host/player or `{type:"auth",role:"tv"}` for public TV; server sends `{type:"ready"}` then role-filtered `{type:"state", ...}`. Client sends `{type:"ping"}` periodically. Other commands are small JSON messages. Player: `{type:"send_clue",word,number}`, `{type:"vote",cardId}`, `{type:"unvote"}`, `{type:"done"}`. Host: `{type:"assign_team",playerId,team}`, `{type:"auto_balance"}`, `{type:"set_spymaster",playerId}`, `{type:"set_options",bestOf?,timer?,mode?}`, `{type:"start_game"}`, `{type:"void_clue"}`, `{type:"swap_word",cardId}`, `{type:"force_resolve",cardId}`, `{type:"reshuffle"}`, `{type:"pause"}`, `{type:"resume"}`, `{type:"remove_player",playerId}`, `{type:"restore_player",playerId}`, `{type:"next_game"}`, `{type:"new_series"}`, `{type:"end_session"}`. Bad requests reply `{type:"error",message}`. All mutating actions are serialized and persisted before broadcasting refreshed snapshots. Role-scoped snapshots never contain seat tokens, unrevealed card colors (except for authenticated spymasters), assassin identity to non-spymasters, or previous clues to operatives/TV.

Host force-resolve intentionally bypasses the usual majority lock as an explicit recovery capability. Time is server-authoritative: a Durable Object alarm enforces expiry; browsers render the countdown based on the server timestamp. Pausing preserves remaining milliseconds. Last-connected operative leaves before a majority? Active denominator is recalculated on disconnect; majority can then be reached without a deadlock. Host/spymaster disconnect pauses the game. Players must have one spymaster **and two operatives per team**, making the effective start minimum **6**, not 4.

## Audit's acceptance gaps and ambiguities

- **The supplied bank example has an arithmetic contradiction**: a clue of 3 followed by *one correct card plus one bystander* consumes 2 guesses, therefore the unused bank must be **1**, not 2. Rules (§2.5) are authoritative. Automated tests assert bank=1. If the intent is to bank 2, one of those two reveals must not spend a guess (requires a revised rule).
- No +1, no 0/unlimited clue, no official foul bonus, no co-op mode.
- `publicSnapshot()` includes full clue history to **spymasters and host console**, but not operatives and not TV. No hidden board colors on the host console either.
- Host `reshuffle` aborts the current game without awarding a point, uses fresh words/key, keeps series score, and restarts that game without advancing its game number. Host `new_series` zeros series score and returns to lobby; removed seats may be restored from the roster.
- **Completed:** original curated 400 + 400 word pack, production-pack integrity tests, and cross-pack overlap protection. **Pending:** real Cloudflare deploy, Pages enablement, live Worker protocol audit, real iOS Safari/Android Chrome device console/network checks, venue Wi-Fi 25-client soak, Zuko's independent sign-off. No 'production-ready' claim until these pass.

## License / scope

Original game code created for AD Arcade; no third-party game assets or runtime QR API. The interface loads optional Google Fonts with local serif/sans-serif fallbacks. The underlying genre is word deduction; no Codenames trademark, official content, or proprietary artwork is included.
