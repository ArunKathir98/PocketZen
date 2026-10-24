# PocketZen — Your Money. Your Control.

Personal finance PWA (React + Vite). Each user signs in with Google and their data is stored as a JSON file in their
own Google Drive **app data folder** (hidden, only PocketZen can read it). No backend.

## 1. Google Cloud setup (one time)

1. Create a project at https://console.cloud.google.com
2. **APIs & Services → Library**: enable **Google Drive API** and **Gmail API** (Gmail is only used to email the "forgot PIN" code to the user themselves).
3. **OAuth consent screen**: External, add app name *PocketZen*, add your Google account(s) as **Test users**.
   Scopes used: `drive.appdata`, `gmail.send`, `openid`, `email`, `profile`.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized JavaScript origins: `http://localhost:5173` and your production URL (e.g. `https://pocketzen.vercel.app`).
5. Copy the client ID into `.env` (see `.env.example`):

```
VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

## 2. Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build + service worker
npm run preview    # test the installable PWA build
```

Deploy `dist/` to any static host over HTTPS (Vercel, Netlify, GitHub Pages, Cloudflare Pages) and add that origin in step 4.
Then open it on your phone and use **Add to Home Screen / Install app**.

## Notes & limits

- **Stay signed in**: the session is kept in local storage and never expires; only *Log out* ends it. Google access
  tokens last ~1h, so PocketZen quietly re-requests one on launch. If the browser blocks that silent request, a
  *Reconnect* banner appears; all changes are saved locally and synced when reconnected. (A refresh-token flow would
  need a backend.)
- **Reminders** fire while the app is open or running in the background as an installed PWA. Guaranteed delivery
  when fully closed would need a push server.
- Gmail's `gmail.send` scope is "sensitive": fine for test users; publicly releasing the app needs Google verification.
- Export/Import: JSON file (PIN is never exported). Import can replace or merge.
- Logo → icons: `npm run icons` regenerates the PWA icons from `src/assets/logo-source.jpg`.
