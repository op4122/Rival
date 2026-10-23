// Rival analytics: the one place PostHog is set up and every custom event is sent from.
// Plain JavaScript (the app has no build step); the JSDoc types below give editors the same checking a .ts file would.
//
// Privacy rules kept here:
// - posthog.identify(user.id) only. Never an email, name or any other personal data in events or person properties.
// - Session replay masks every input (maskAllInputs) and hides elements marked .ph-no-capture (the signed-in email).
// - Settings → Analytics can switch all of this off on a device; then PostHog is not even loaded.
// Event list and properties: ANALYTICS.md.
(function () {
  'use strict';
  /**
   * @typedef {Object} RivalEvents
   * @property {{standalone: boolean, signed_in: boolean, surface: 'app'}} app_opened
   * @property {{method: 'google'|'email'}} signup_completed
   * @property {{mode: 'program'|'today'|'week', exercise_count: number}} workout_started
   * @property {{duration_min: number, set_count: number, total_volume: number}} workout_completed
   * @property {{exercise_id: string, weight_kg: number, reps: number, offline: boolean}} set_logged
   * @property {{exercise_id: string, margin: number}} ghost_set_beaten
   * @property {{score: number}} readiness_checkin_completed
   * @property {{}} heatmap_viewed
   * @property {{exercise_id: string, pending: number}} offline_set_queued
   * @property {{rows: number}} sync_completed
   * @property {{location: string, label: string}} cta_clicked
   * @property {{exercise_id: string, type: 'reps'|'weight', eased: boolean}} progression_suggested
   * @property {{exercise_id: string, type: 'reps'|'weight', via: 'prefill'|'tap'}} progression_accepted
   * @property {{exercise_id: string, sessions: number}} plateau_detected
   * @property {{exercise_id: string, action: 'swap'|'lighter'|'dismiss'}} plateau_action
   * @property {{avg_readiness: number, plateaued: number}} deload_suggested
   * @property {{avg_readiness: number, plateaued: number}} deload_accepted
   */
  /** @type {Array<keyof RivalEvents>} */
  var EVENTS = ['app_opened', 'signup_completed', 'workout_started', 'workout_completed', 'set_logged', 'ghost_set_beaten',
    'readiness_checkin_completed', 'heatmap_viewed', 'offline_set_queued', 'sync_completed', 'cta_clicked',
    'progression_suggested', 'progression_accepted', 'plateau_detected', 'plateau_action', 'deload_suggested', 'deload_accepted'];
  var OFF_KEY = 'rival.analytics';
  // Where the vendored posthog-js lives, relative to the page: the app uses vendor/, the marketing site app/vendor/.
  var VENDOR = (document.currentScript && document.currentScript.getAttribute('data-vendor')) || 'vendor/posthog.js';
  var cfg = window.RIVAL_CONFIG || {};
  var queue = [], ready = false, started = false;
  function enabled() { try { return localStorage.getItem(OFF_KEY) !== 'off'; } catch (e) { return true; } }
  var on = !!(cfg.posthogKey && cfg.posthogHost) && enabled();

  function run(fn) { if (!on) return; if (ready && window.posthog) { try { fn(window.posthog); } catch (e) {} } else queue.push(fn); }

  function init() {
    if (!window.posthog || ready) return;
    window.posthog.init(cfg.posthogKey, {
      api_host: cfg.posthogHost,
      ui_host: 'https://us.posthog.com',
      person_profiles: 'identified_only',   // anonymous visitors don't create person records
      autocapture: true,
      capture_pageview: false,               // the app is one page with tabs: pageviews are sent by hand on each tab change
      capture_pageleave: true,
      disable_external_dependency_loading: true, // everything comes from our own vendored build, nothing from a CDN
      session_recording: { maskAllInputs: true, maskTextSelector: '.ph-no-capture' },
      respect_dnt: true,
      loaded: function () { ready = true; var q = queue; queue = []; q.forEach(function (fn) { try { fn(window.posthog); } catch (e) {} }); }
    });
  }
  function load() {
    if (!on || started) return; started = true;
    var s = document.createElement('script');
    s.src = VENDOR;
    s.async = true; s.onload = init;
    document.head.appendChild(s);
  }
  // Load after the page has drawn, so analytics never slows down opening the app.
  if (document.readyState === 'complete') setTimeout(load, 300); else addEventListener('load', function () { setTimeout(load, 300); });

  var api = {
    /**
     * Send one of Rival's custom events.
     * @template {keyof RivalEvents} K
     * @param {K} name
     * @param {RivalEvents[K]} [props]
     * @param {{beacon?: boolean}} [opts] beacon: true for clicks that navigate away
     */
    track: function (name, props, opts) {
      if (EVENTS.indexOf(name) < 0) { try { console.warn('Unknown analytics event', name); } catch (e) {} return; }
      run(function (ph) { ph.capture(name, props || {}, opts && opts.beacon ? { transport: 'sendBeacon' } : undefined); });
    },
    /** A normal pageview of the current URL (marketing site). */
    pageview: function () { run(function (ph) { ph.capture('$pageview'); }); },
    /** A screen change inside the app (tabs), recorded as a pageview of a virtual path. @param {string} screen */
    screen: function (screen) {
      run(function (ph) { ph.capture('$pageview', { $current_url: location.origin + location.pathname + '#' + screen, screen: screen }); });
    },
    /** After sign-in: link this device's events to the user id. No email or name. @param {string} userId */
    identify: function (userId) { run(function (ph) { if (ph.get_distinct_id() !== userId) ph.identify(userId); }); },
    /** After sign-out: new anonymous id, so the next person on this phone isn't linked to the last one. */
    reset: function () { run(function (ph) { ph.reset(); }); },
    enabled: function () { return enabled(); },
    /** Settings switch. Turning it off stops capture and replay on this device right away. @param {boolean} yes */
    setEnabled: function (yes) {
      try { localStorage.setItem(OFF_KEY, yes ? 'on' : 'off'); } catch (e) {}
      if (!yes) { if (window.posthog && ready) { try { window.posthog.opt_out_capturing(); window.posthog.stopSessionRecording && window.posthog.stopSessionRecording(); } catch (e) {} } on = false; queue = []; }
      else { on = !!(cfg.posthogKey && cfg.posthogHost); if (window.posthog && ready) { try { window.posthog.opt_in_capturing(); } catch (e) {} } else load(); }
    }
  };
  window.RivalAnalytics = api;
})();
