# Rival

Train against last week's you. Rival is a workout logger that runs in the browser and installs to your phone's home screen.

- **Ghost sets:** last session's weight × reps sits beside every set. Beat it and the ghost dissolves.
- **Readiness check-in:** three taps (sleep, soreness, energy) adjust today's loads.
- **Muscle heat map:** an anatomical front and back body map of weekly sets per muscle against a 10–20 set target.
- **Programs:** suggested splits for 2 to 6 days a week, or build your own for 1 to 7 days.
- **Something else:** train a single focus today, or a short plan for the next 7 days, without moving your program.
- **Tools:** 108 exercises (free-weight and machine options), plate calculator, auto warm-ups, custom exercises, kg or lb per exercise, backup and restore.

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
