# Rival

Train against last week's you. Rival is a workout logger that runs in the browser and installs to your phone's home screen.

- **Ghost sets:** last session's weight × reps sits beside every set. Beat it and the ghost dissolves.
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
