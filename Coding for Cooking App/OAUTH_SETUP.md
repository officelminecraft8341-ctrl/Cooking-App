# Social sign-in setup (Google + Apple)

**Status: Google is configured and live.** Apple awaits an Apple Developer
account (the button stays hidden until then).

The app already has the full OAuth flow deployed. These credentials are the
only missing piece — once the keys are in, the buttons appear automatically
in the sign-in modal and in **Security → Connected accounts**.

## Shared value (used by both providers)

- **Authorized redirect URI** for both providers:
  `https://cooking-app-duc.pages.dev/api/auth/oauth/google/callback`
  `https://cooking-app-duc.pages.dev/api/auth/oauth/apple/callback`
- `OAUTH_REDIRECT_BASE` is already set on Cloudflare to
  `https://cooking-app-duc.pages.dev` — nothing to change there.
- For local testing, the server builds redirects from `OAUTH_REDIRECT_BASE`
  in `.env` (use `http://localhost:3001` there) — you'd add both callback
  URIs in the provider consoles.

## Google (10 minutes, free)

1. Go to <https://console.cloud.google.com/> and sign in.
2. Top bar → project dropdown → **New project** → name it `ChefAI` → **Create**.
3. Open **APIs & Services → OAuth consent screen** (Google may label it
   "Google Auth Platform → Branding" in newer UI):
   - User type: **External**
   - App name: `ChefAI`; user support email: yours; developer contact: yours.
   - Scopes: add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
   - Test users: add your own Gmail — while the app is in "Testing", only
     listed users can sign in (you can publish later; no review needed for
     basic profile/email).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `ChefAI web`
   - **Authorized redirect URIs**: add
     `https://cooking-app-duc.pages.dev/api/auth/oauth/google/callback`
     (and `http://localhost:3001/api/auth/oauth/google/callback` for local dev)
   - No JavaScript origins needed.
5. Copy the **Client ID** and **Client secret**.

## Apple (needs a paid Apple Developer account, $99/yr)

If you don't have one, skip Apple for now — Google alone works fine and the
Apple button stays hidden until its keys exist.

1. <https://developer.apple.com/account> → **Certificates, IDs & Profiles →
   Identifiers → +**
   - Type **App IDs → App**, description `ChefAI`, explicit ID
     `com.chefai.app` (any unique string works). Enable the **Sign In with
     Apple** capability. Register.
2. Identifiers → **+** again → type **Services IDs** → continue:
   - Description: `ChefAI web`; Identifier: `com.chefai.web` (this is your
     `APPLE_CLIENT_ID`).
   - Check **Sign In with Apple → Configure**:
     - Primary App ID: `com.chefai.app`
     - **Return URLs**: add
       `https://cooking-app-duc.pages.dev/api/auth/oauth/apple/callback`
     - Save.
3. **Keys → +**: name `ChefAI signin`, check **Sign In with Apple →
   Configure** → Primary App ID `com.chefai.app` → Register.
   - **Download the .p8 file now — it's shown once.** Note the **Key ID**
     shown in the table (10 chars).
4. Membership page → note your **Team ID** (10 chars, top-right).

## Give me these values

| Variable | Where it comes from |
|---|---|
| `GOOGLE_CLIENT_ID` | Google step 5 (ends in `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | Google step 5 |
| `APPLE_CLIENT_ID` | Apple step 2 (the Services ID, `com.chefai.web`) |
| `APPLE_KEY_ID` | Apple step 3 (Key ID) |
| `APPLE_KEY_PEM` | The full .p8 file contents, including the `-----BEGIN PRIVATE KEY-----` lines |
| `APPLE_TEAM_ID` | Apple step 4 (only if I need to build the client secret JWT differently) |

Paste them here and I'll set them as **encrypted secrets** on Cloudflare
(not visible in the dashboard afterward), add them to local `.env`, and run
a live end-to-end test of both sign-in flows.

> Security note: keys pasted in chat should be treated as staging secrets.
> If this app ever grows beyond personal use, rotate them from the provider
> consoles afterward.
