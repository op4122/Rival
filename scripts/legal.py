# Builds privacy.html and terms.html with the marketing site's own fonts, colours and nav.
# Run from the repo root after editing the text below:  python3 scripts/legal.py
import re
site = open('index.html').read()
css = site[site.index('<style>') + 7: site.index('/* hero */')]
css = re.sub(r'\.install-hint\{[^}]*\}\n|\.close \.install-hint\{[^}]*\}\n', '', css)
foot_css = '\n'.join(l for l in site.split('\n') if l.startswith(('.foot{', '.foot a{', '.foot-r{')))
mark = re.search(r'<svg class="mark".*?</svg>', site, re.S).group(0)
UPDATED = '22 October 2026'
EMAIL = 'almahrouqiahmed6@gmail.com'

def page(slug, title, desc, body):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title} · Rival Workouts</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://op4122.github.io/Rival/{slug}.html">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ECEEE9">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0D0F13">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="assets/icon.svg" type="image/svg+xml">
<style>
{css}
{foot_css}
/* legal pages */
.legal{{max-width:68ch;padding-block:32px 24px}}
.legal h1{{font-family:var(--display);font-stretch:118%;font-weight:800;font-size:clamp(38px,6vw,60px);line-height:1;letter-spacing:-.025em}}
.legal .upd{{margin-top:12px;color:var(--muted);font-size:15px}}
.legal .sum{{margin-top:24px;padding:18px 20px;border-radius:18px;background:var(--surface)}}
.legal .sum p + p{{margin-top:8px}}
.legal h2{{font-family:var(--display);font-stretch:112%;font-weight:750;font-size:22px;line-height:1.2;margin-top:36px}}
.legal p,.legal li{{color:var(--ink)}}
.legal p{{margin-top:10px}}
.legal ul{{margin:10px 0 0;padding-left:1.2em}}
.legal li + li{{margin-top:6px}}
.legal a{{color:var(--accent-text);text-underline-offset:3px;overflow-wrap:anywhere}}
.legal b{{font-weight:650}}
@media (max-width:560px){{.nav-r .nl{{display:none}}}}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="wrap">
  <nav class="nav" aria-label="Main">
    <a class="brand" href="./" aria-label="Rival, home">
      {mark}
      Rival
    </a>
    <div class="nav-r">
      <a class="nl" href="privacy.html"{' aria-current="page"' if slug == 'privacy' else ''}>Privacy</a><a class="nl" href="terms.html"{' aria-current="page"' if slug == 'terms' else ''}>Terms</a>
      <a class="cta-s press" href="app/" data-cta="nav">Open the app</a>
    </div>
  </nav>
  <main id="main" class="legal">
{body}
  </main>
  <footer class="foot"><span>Rival, a training project by Ahmed Al Mahrouqi. Made in Oman.</span><span class="foot-r"><a href="./">Home</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="mailto:{EMAIL}">{EMAIL}</a></span></footer>
</div>
<!-- Analytics: the same PostHog project as the app, so a visit and the first workout join up into one funnel.
     Public keys only (app/config.js); the library is our own vendored copy. -->
<script src="app/config.js"></script>
<script src="app/analytics.js" data-vendor="app/vendor/posthog.js"></script>
<script>
(function () {{
  var A = window.RivalAnalytics; if (!A) return;
  A.pageview();
  // Every "Open the app" button (and any other link into the app) reports where it was clicked from.
  document.addEventListener('click', function (e) {{
    var a = e.target.closest && e.target.closest('a[href^="app/"], a[href="./app/"]'); if (!a) return;
    var sec = a.closest('section[id], header, footer');
    A.track('cta_clicked', {{location: a.dataset.cta || (sec && (sec.id || sec.tagName.toLowerCase())) || 'page', label: a.textContent.trim().slice(0, 40)}}, {{beacon: true}});
  }});
}})();
</script>
</body>
</html>
'''

privacy = f'''    <h1>Privacy Policy</h1>
    <p class="upd">Last updated {UPDATED}</p>
    <div class="sum">
      <p><b>In short:</b> you can use Rival without an account, and your workouts stay on your phone. If you sign in, your workouts are stored in your account so they're backed up and follow you to other phones. Rival collects usage analytics to get better. Nothing is sold, and there are no ads.</p>
      <p>Questions or deletion requests: <a href="mailto:{EMAIL}">{EMAIL}</a></p>
    </div>

    <h2>Who runs Rival</h2>
    <p>Rival Workouts is made by Ahmed Al Mahrouqi, an individual developer in Oman. In this policy, "Rival", "we" and "us" mean him. Contact: <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>

    <h2>What we collect</h2>
    <ul>
      <li><b>If you sign in with Google:</b> Google shares your name and email address with Rival (Google's basic profile also includes a link to your profile picture, which Rival doesn't use). We ask for nothing else from your Google account.</li>
      <li><b>If you sign in with email:</b> your email address, so we can send you a sign-in link.</li>
      <li><b>Your training, if you're signed in:</b> workouts, sets (weight, reps, time), readiness check-in answers and score, your training plan, custom exercises and app settings.</li>
      <li><b>Usage analytics:</b> which screens you open and what you tap, events such as starting or finishing a workout, device and browser type, and an approximate location worked out from your IP address. See "Analytics and session replay" below.</li>
    </ul>
    <p>Without an account, your workouts and settings are stored only in your browser on your phone. They never reach us.</p>

    <h2>How we use it</h2>
    <ul>
      <li>To sign you in and keep you signed in.</li>
      <li>To store and sync your workouts and plan, and to show your past sets ("ghost sets"), progress and heat map.</li>
      <li>To understand how Rival is used, find bugs and decide what to improve.</li>
      <li>To reply when you contact us.</li>
    </ul>
    <p>We don't sell your data, we don't show ads, and we don't use your data to advertise to you anywhere else.</p>

    <h2>Where it's stored and who processes it</h2>
    <p>Rival uses a few services to run. They process data only to provide their service to us:</p>
    <ul>
      <li><b>Supabase</b> hosts the database and sign-in. Your account and workouts are stored in its data centre in Seoul, South Korea.</li>
      <li><b>PostHog</b> (United States) receives usage analytics and session recordings.</li>
      <li><b>Google</b> handles "Continue with Google" sign-in.</li>
      <li><b>GitHub Pages</b> hosts the website and app files, and may log basic request data such as IP addresses.</li>
    </ul>
    <p>This means your data may be stored and processed outside your country.</p>

    <h2>Analytics and session replay</h2>
    <p>Rival uses PostHog to see how the app is used. This includes session replay: a recording of what happens on screen (taps, scrolls and screen changes), used to find confusing parts and bugs.</p>
    <ul>
      <li>Everything you type is masked, so typed weights, reps and email addresses are never recorded.</li>
      <li>Your signed-in email is hidden in recordings, and we never send your email or name to PostHog. When you sign in, your activity is linked to your account's random ID only.</li>
      <li>Session recordings are kept for 30 days.</li>
      <li>You can turn analytics off at any time in the app: <b>Settings → Usage analytics → Off</b>. It stops on that phone straight away. If your browser sends "Do Not Track", Rival respects it.</li>
    </ul>

    <h2>How long we keep it</h2>
    <p>Your account and training data are kept until you delete them or ask us to delete your account. Deleting a workout in the app, or using <b>Delete all workouts</b> in Settings, also removes it from your account. Analytics events are kept by PostHog for as long as our plan allows, and recordings for 30 days.</p>

    <h2>Deleting your account</h2>
    <p>Email <a href="mailto:{EMAIL}?subject=Delete%20my%20Rival%20account">{EMAIL}</a> from the address you signed in with (or, for Google sign-in, the Gmail address you used), with the subject "Delete my Rival account". We'll delete your account and all training data stored with it within 30 days and confirm by email. Workouts kept only on your phone can be removed in the app at any time.</p>

    <h2>Your choices and rights</h2>
    <ul>
      <li>Use Rival without an account, so nothing leaves your phone except analytics (which you can switch off).</li>
      <li>Export a backup of your workouts any time from Settings.</li>
      <li>Ask for a copy of your data, a correction or deletion by emailing us.</li>
    </ul>

    <h2>Security</h2>
    <p>Data travels over encrypted connections. In the database, each account can only read and change its own rows. No service is perfectly secure, but we take reasonable care to protect your data.</p>

    <h2>Children</h2>
    <p>Rival isn't meant for children under 13, and we don't knowingly collect their data. If you think a child has signed up, email us and we'll delete the account.</p>

    <h2>Changes</h2>
    <p>If this policy changes, we'll update the date at the top. For important changes we'll also say so in the app.</p>
'''

terms = f'''    <h1>Terms of Use</h1>
    <p class="upd">Last updated {UPDATED}</p>
    <div class="sum">
      <p><b>In short:</b> Rival is free to use. It's a training log, not medical advice, so train sensibly. Your workouts are yours. Please don't misuse the service.</p>
    </div>

    <h2>Using Rival</h2>
    <p>Rival Workouts ("Rival") is a workout tracker made by Ahmed Al Mahrouqi. By using it you agree to these terms and to the <a href="privacy.html">Privacy Policy</a>. You can use Rival without an account, or sign in with Google or email to back up and sync your workouts.</p>

    <h2>Your account</h2>
    <p>Keep access to your Google account or email secure, because that is how you sign in to Rival. You're responsible for what happens under your account. You must be at least 13 years old to create an account.</p>

    <h2>Health and safety</h2>
    <p>Rival suggests weights, reps and lighter days based on your past sessions and check-in. These are general suggestions, not medical, fitness or professional advice. Check with a doctor before starting a new exercise programme, especially if you have a health condition or an injury. Use good form, use spotters and safety equipment where needed, and stop if something hurts. You train at your own risk.</p>

    <h2>Your content</h2>
    <p>The workouts, plans and notes you enter are yours. You let us store and process them only to run Rival for you, as described in the Privacy Policy. You can export or delete them at any time.</p>

    <h2>Acceptable use</h2>
    <p>Don't try to break, overload or get around the security of Rival or its services, access other people's data, or use Rival for anything unlawful. We may suspend or delete accounts that do.</p>

    <h2>The service</h2>
    <p>Rival is free and provided "as is", without warranties of any kind. It may change, have downtime or stop. Features can be added or removed. Keep your own backups (Settings → Export backup) if your training history matters to you.</p>

    <h2>Liability</h2>
    <p>As far as the law allows, Rival and its maker aren't liable for any injury, lost data or other loss that comes from using or not being able to use Rival. Nothing in these terms limits rights you have under laws that can't be excluded.</p>

    <h2>Ending your use</h2>
    <p>You can stop using Rival at any time and ask us to delete your account by emailing <a href="mailto:{EMAIL}?subject=Delete%20my%20Rival%20account">{EMAIL}</a>.</p>

    <h2>Changes and law</h2>
    <p>We may update these terms; the date at the top shows the latest version, and continuing to use Rival means you accept it. These terms are governed by the laws of the Sultanate of Oman.</p>

    <h2>Contact</h2>
    <p><a href="mailto:{EMAIL}">{EMAIL}</a></p>
'''
open('privacy.html', 'w').write(page('privacy', 'Privacy Policy', 'How Rival Workouts handles your data: what is collected, where it is stored, analytics, and how to delete your account.', privacy))
open('terms.html', 'w').write(page('terms', 'Terms of Use', 'The terms for using Rival Workouts, the free workout tracker.', terms))
print('privacy.html, terms.html written')
