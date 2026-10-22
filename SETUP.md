# Rival: manual setup in dashboards

Status (23 Oct 2026): steps 1, 4 and 5 are done by the owner. Google app is in Testing (only listed test users can sign in).

Things only the project owner can do in the Supabase, Google Cloud and GitHub dashboards.
Project: `rival` (ref `rwlpwhwagcrzpusplvcz`). App URL: `https://op4122.github.io/Rival/app/`.

## 1. Supabase → Authentication → URL Configuration

- **Site URL:** `https://op4122.github.io/Rival/app/`
- **Redirect URLs** (add all three):
  - `https://op4122.github.io/Rival/app/**`
  - `http://localhost:8765/app/**`
  - `http://127.0.0.1:8765/app/**`

The app sends people back to the exact page they signed in from, so these patterns cover the live site and local testing. Keep the capital R in `/Rival/`.

## 2. Email templates (later, needs custom SMTP)

Templates can't be edited until custom SMTP is set up, so magic-link emails contain a link only. The app therefore
shows the note "On iPhone, open the link in the same browser you installed Rival from." If you set up SMTP later,
adding `{{ .Token }}` to the Magic Link template would let the app offer a typed code too.

## 3. Supabase → Authentication → Emails → SMTP Settings (before real users sign in)

Supabase's built-in email sender is for testing: it only delivers to members of your Supabase organization and allows a few emails an hour. For real users, connect your own SMTP provider (for example Resend, Postmark or Amazon SES) here. Until then, only you can sign in by email.

## 4. Google Cloud Console (for "Continue with Google")

1. Go to https://console.cloud.google.com and create a project, e.g. "Rival".
2. **APIs & Services → OAuth consent screen** (now called *Google Auth Platform*):
   - User type: **External**. App name: **Rival**. Support email: yours.
   - Authorized domain: `supabase.co`.
   - Scopes: the defaults (`openid`, `email`, `profile`). Nothing else is needed.
   - While the app is in **Testing**, only test users you list can sign in. Click **Publish app** when ready; basic scopes don't need Google's review.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**. Name: `Rival (Supabase)`.
   - **Authorized JavaScript origins:** `https://op4122.github.io` and `http://localhost:8765`
   - **Authorized redirect URIs:** `https://rwlpwhwagcrzpusplvcz.supabase.co/auth/v1/callback`
   - Create, then copy the **Client ID** and **Client secret**.

## 5. Supabase → Authentication → Sign In / Providers → Google

- Enable **Google**.
- Paste the **Client ID** and **Client secret** from step 4.
- Save. The callback URL shown there should be `https://rwlpwhwagcrzpusplvcz.supabase.co/auth/v1/callback`, the same one you gave Google.

The client secret lives only in Supabase. It never goes in the app or the repo.

## 6. GitHub (Phase 7)

Added after Phase 7: repository secrets and the Pages source.
