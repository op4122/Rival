# Rival analytics

PostHog project **Rival** (ID 680729, US cloud, host `https://us.i.posthog.com`). Both the app (`/Rival/app/`) and the
marketing site (`/Rival/`) report to it, so a visit, a click on "Open the app" and the first workout join up as one person.

## How it's wired

- **One helper:** `app/analytics.js` defines `RivalAnalytics.track(name, props)` with JSDoc types for every event below.
  Unknown event names are refused. The app calls it through `A.track(...)`; nothing else talks to PostHog.
- **Library:** the pinned `posthog-js` copy in `app/vendor/posthog.js` (no CDN), loaded after the page has drawn.
  Events from before it loads are queued.
- **Config:** `posthogKey` and `posthogHost` in `app/config.js`, written from `.env` / repository secrets.
- **Autocapture:** on (clicks and form changes). Inputs are never recorded as text.
- **Pageviews:** the app is one page with tabs, so automatic pageviews are off and `$pageview` is sent on each screen
  change with `screen` = `today`, `progress`, `plan`, `settings` or `workout` (URL `…/app/#<screen>`). The site sends
  one normal `$pageview` per page.
- **Session replay:** on in the project. The SDK sets `maskAllInputs: true`, so typed text (weights, reps, email) is
  never recorded, and anything with the class `ph-no-capture` (the signed-in email) is hidden.
- **Identity:** after sign-in, `posthog.identify(user.id)` with the Supabase user id only. No email, name or other
  personal data is sent as event or person properties. Sign-out calls `posthog.reset()`.
- **People:** `person_profiles: 'identified_only'`, so anonymous visitors don't create person records.
- **Opt-out:** Settings → Usage analytics → Off stops capture and replay on that phone and keeps PostHog from loading.
  Browsers with Do Not Track on are also respected.

## Events

| Event | Fires when | Properties |
|---|---|---|
| `app_opened` | The app starts (after the sign-in check) | `standalone` (installed to home screen), `signed_in`, `surface: 'app'` |
| `signup_completed` | First sign-in of an account created in the last 10 minutes (once per account per phone) | `method`: `'google'` or `'email'` |
| `workout_started` | Start is tapped | `mode`: `'program'`, `'today'` or `'week'`; `exercise_count` |
| `workout_completed` | A workout is saved | `duration_min`, `set_count` (logged sets), `total_volume` (kg, weight × reps) |
| `set_logged` | A set is ticked off | `exercise_id` (Rival's exercise slug, e.g. `bench`, `pushdown__rope`), `weight_kg`, `reps`, `offline` |
| `ghost_set_beaten` | A logged set beats last session's set | `exercise_id`, `margin` (estimated 1-rep-max gain in kg, Epley) |
| `readiness_checkin_completed` | The third check-in answer is given | `score` (0–100) |
| `heatmap_viewed` | The Progress tab (muscle heat map) is opened | none |
| `offline_set_queued` | A set is logged while offline and signed in | `exercise_id`, `pending` (changes waiting to sync) |
| `sync_completed` | The sync worker finishes sending changes | `rows` (rows sent) |
| `cta_clicked` | Marketing site: a link into the app is clicked | `location` (`nav`, `hero`, `closing` or the section id), `label` (button text) |

PostHog's own events also arrive: `$pageview`, `$autocapture`, `$pageleave`, `$identify`, `$web_vitals`, and
session recordings.

## Useful funnels

- **Visitor to user:** `$pageview` on `/Rival/` → `cta_clicked` → `app_opened` → `workout_completed`.
- **Activation:** `app_opened` → `readiness_checkin_completed` → `workout_started` → `workout_completed`.
- **Accounts:** `app_opened` (signed_in = false) → `signup_completed`, broken down by `method`.

## Housekeeping

- `probe3` is a single test event sent while setting this up. Hide it in PostHog → Data management → Events.
- Test traffic from the automated checks comes from the test users `rival-test-a@example.com` / `rival-test-b@example.com`
  (removed at the end of setup) and from a headless browser.
