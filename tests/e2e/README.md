# WARNOTO responsive E2E contract

The harness runs every spec in Chromium at 360x800, 390x844, 412x915, and
768x1024. `npm run test:e2e` owns an isolated Vite server on `localhost:4173`;
the server never opens a user browser.

Isolation is mandatory:

- E2E mode makes `src/supabaseClient.js` export a null client even if local
  Supabase environment variables exist.
- Playwright also clears and seeds browser storage before every test.
- The request guard aborts and fails the test if Supabase, Groq, or Cohere is
  contacted. Do not remove or bypass this guard.

The manifest currently covers every stable top-level menu plus dashboard,
capacity, master-data, TUG, heavy-equipment, ATTB, opname/count, forecast,
material-spares, and Pak War sub-surfaces. To extend route coverage:

1. Add a `surface(...)` row to `route-manifest.js`. `menuPath` is the ordered
   list of accessible drawer buttons; dashboard uses `null` because it is the
   initial route. Add in-page `actions` only for stable tabs/buttons.
2. Call `openApp(page)`, then `openRoute(page, ROUTES.yourRoute)`.
3. Wait on `readySelector`, call `assertResponsiveSurface(page, readySelector)`,
   and save a full-page screenshot with
   `testInfo.outputPath("route-state.png")`.
4. Keep fixture data deterministic in `fixtures.js`. Never add real users,
   tokens, URLs, or production responses.

The semantic contract reports document overflow, controls below 44x44px, text
below 12px, undersized form controls, and tables that overflow without a local
horizontal-scroll container. Keep each assertion scoped to the surface's
`readySelector` so failures name the relevant UI rather than unrelated chrome.

Forecast detail is intentionally absent: opening it currently starts a Groq
request immediately. Add it only after the application exposes a deterministic
offline detail state; the E2E suite must never weaken the external-request guard.

Generated screenshots and traces live under `test-results/`; the HTML report
is under `playwright-report/`. Both are intentionally gitignored.
