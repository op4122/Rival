# Rival

Train against last week's you. Rival is a workout logger that runs in the browser and installs to your phone's home screen.

- **Ghost sets:** last session's weight × reps sits beside every set. Beat it and the ghost dissolves.
- **Suggested progression:** double progression from the ghost. Hit the top of the rep range on every set and the next weight up is suggested (2.5 kg barbell, 2 kg dumbbell, the machine's step, or your own Weight jump in the exercise's ⋯ menu); otherwise one more rep on the first set that fell short. The inputs start on the suggestion, with a small badge on the box that moved on ("+1" on reps, "+2.5" on weight, grey "Eased" when readiness lowered the load, which is applied after the progression). Change the numbers and "↺ Reset" puts the suggestion back.
- **Readiness check-in:** three taps (sleep, soreness, energy) adjust today's loads.
- **Muscle heat map:** an anatomical front and back body map of weekly sets per muscle against a 10–20 set target.
- **Programs:** suggested splits for 2 to 6 days a week, or build your own for 1 to 7 days.
- **Something else:** train a single focus today, or a short plan for the next 7 days, without moving your program.
- **Import a plan:** paste a plan from Notes, a spreadsheet or a chat app (or pick a .txt/.csv file). Rival matches each line to its library and lets you fix anything it didn't recognise before the plan changes.
- **Attachments:** cable lifts offer Rope, Straight bar, V-bar and more. Each attachment keeps its own weights and ghost (stored as its own exercise, e.g. `pushdown__rope`). Custom exercises can list their own attachments.
- **Rest timer sound:** a short chime when rest ends (turn it off on the Settings tab). It plays over your music without pausing it and follows the silent switch. iPhone web apps can't vibrate, and nothing can run once the phone is locked, so a locked-screen alert needs a push service or a native app.
- **Settings tab:** light or dark mode, units, rest times, warm-ups, backups, a short help section and an Email feedback button (almahrouqiahmed6@gmail.com).
- **Tools:** 108 exercises (free-weight and machine options), plate calculator, auto warm-ups, custom exercises, swap any exercise mid-workout (same-muscle matches first), kg or lb per exercise, per-side weights for dumbbell lifts, light or dark mode, backup and restore.

Run the browser checks with `python3 -m http.server 8765 &` then `node tests/app.test.mjs` (needs Playwright).

## Structure

```
index.html              marketing site  ->  https://op4122.github.io/Rival/
app/index.html          the app         ->  https://op4122.github.io/Rival/app/
app/manifest.webmanifest  name, icons, colours for "Add to Home Screen"
app/sw.js               service worker: saves the app on the phone for offline use
app/icons/              home-screen and app icons
assets/fonts/           Archivo and Instrument Sans (SIL Open Font License)
assets/shots/           app screenshots used on the site (light and dark)
assets/og.png           social share image (1200x630)
```

## Publish on GitHub Pages

1. Push this folder to a repository named `rival`.
2. Settings → Pages → Source: "Deploy from a branch", Branch: `main`, folder `/ (root)`.
3. Open `https://op4122.github.io/Rival/` after a minute.

## Updating the app

Change `CACHE` in `app/sw.js` (e.g. `rival-v2`) whenever you ship changes, so phones drop the old saved copy.

Data lives in each phone's browser storage. Use Plan → Export backup to save a JSON file.

## Backend setup (Supabase + PostHog)

The app still has no build step. npm is only used to fetch pinned browser builds and write config:

1. `npm install` then `npm run vendor` copies supabase-js, Dexie and posthog-js into `app/vendor/` (committed, so Pages serves them and the service worker caches them).
2. `cp .env.example .env`, fill it in, then `npm run config` writes `app/config.js`. It is committed (public keys only), so Pages serves it with no build step.
3. `app/supabase.js` creates the one Supabase client (`window.rivalDb`). Without config it is `null` and the app works on the phone only.

Only public keys go in config: the Supabase publishable key and the PostHog project key. Never the Supabase secret or service_role key.

## Sync (offline-first)

The phone is the source of truth and logging never waits for the network. When signed in, every save is turned into
database rows and compared with what Supabase last confirmed; the difference goes into an outbox in IndexedDB (via Dexie).
A worker sends it when online (on start, reconnect and when the app returns to the screen), retrying with exponential
backoff. Sets upsert on `client_id` and workouts on their own id, so retries never duplicate. Workouts made on another
phone are pulled into local history, so ghost sets and the heat map work offline. Sample workouts never upload, and a
phone's workouts stay tied to the first account that signed in on it.

Checks: `npm test` runs `tests/app.test.mjs` (UI), `tests/analytics.test.mjs` (PostHog events) and
`tests/offline.sw.mjs` (service worker). Live checks against the real project need password test users
(`rival-test-a/b/c@example.com`, one shared password), made for the run and deleted afterwards:
`RIVAL_TEST_PW=… node tests/sync.live.mjs` (sync, users a and b), `tests/rivals.live.mjs` (invite, race, remove, revoke;
users a, b and c) and `tests/supersets.live.mjs` (superset groups sync; user c). Behind an HTTP proxy the browser uses
`HTTPS_PROXY`.

Rivals security: `tests/rivals.rls.sql` makes three throwaway users inside one transaction, proves a non-rival gets
nothing (tables and `get_rival_ghost`), and always rolls back. Paste it in the Supabase SQL editor; the message reads
`RLS TEST PASSED: 25 checks` or names the check that failed.
