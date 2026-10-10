# Rival

Train against last week's you. Rival is a workout logger that runs in the browser and installs to your phone's home screen.

- **Ghost sets:** last session's weight × reps sits beside every set. Beat it and the ghost dissolves.
- **Readiness check-in:** three taps (sleep, soreness, energy) adjust today's loads.
- **Muscle heat map:** weekly sets per muscle against a 10–20 set target.

## Structure

```
index.html              marketing site  ->  https://<user>.github.io/rival/
app/index.html          the app         ->  https://<user>.github.io/rival/app/
app/manifest.webmanifest  name, icons, colours for "Add to Home Screen"
app/sw.js               service worker: saves the app on the phone for offline use
app/icons/              home-screen and app icons
assets/fonts/           Archivo and Instrument Sans (SIL Open Font License)
```

## Publish on GitHub Pages

1. Push this folder to a repository named `rival`.
2. Settings → Pages → Source: "Deploy from a branch", Branch: `main`, folder `/ (root)`.
3. Open `https://<user>.github.io/rival/` after a minute.

## Updating the app

Change `CACHE` in `app/sw.js` (e.g. `rival-v2`) whenever you ship changes, so phones drop the old saved copy.

Data lives in each phone's browser storage. Use Plan → Export backup to save a JSON file.
