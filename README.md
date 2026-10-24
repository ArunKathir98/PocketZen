# PocketZen — Your Money. Your Control.

Personal finance PWA (React + Vite). Each user signs in with Google and their data is stored as a JSON file in their
own Google Drive **app data folder** (hidden, only PocketZen can read it). No backend.

## 1. Google Cloud setup (one time)

1. Create a project at https://console.cloud.google.com
2. **APIs & Services → Library**: enable **Google Drive API**.
3. **OAuth consent screen**: External, add app name *PocketZen*, add your Google account(s) as **Test users**.
   Scopes used: `drive.appdata`, `openid`, `email`, `profile` (all non-sensitive, so no Google verification is needed).
   When ready, click **Publish app** to move from Testing to Production (no user cap, no 7-day re-consent).
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

## Shared groups (split expenses)

Groups are the one feature that needs a server, because several people edit the same data. `worker/index.js` is a
Cloudflare Worker that serves the app and the `/api/groups` API; each group is a **Durable Object** (SQLite-backed,
works on the free plan). `wrangler.jsonc` declares it, so `npx wrangler deploy` (what Cloudflare's Git build runs)
creates everything. No dashboard setup.

- A group is addressed by a random 12-character ID; anyone with the ID can view and edit it. Idle groups are erased after 12 months.
- Edits are small "set entity" operations resolved last-write-wins per entity; clients poll every ~6 s while visible and queue edits offline.
- Group logic shared by the app and the Worker: `src/lib/groupState.js` (splits, balances, settle-up suggestions).
- `npm run dev` has no `/api`. To try groups locally: `npm run build && npx wrangler dev`.
- Groups, budgets, EMIs, loans and reminders need a Google account; the no-account mode is Records, Categories and Accounts.

## Notes & limits

- **Stay signed in**: the session is kept in local storage and never expires; only *Log out* ends it. Google access
  tokens last ~1h, so PocketZen quietly re-requests one on launch. If the browser blocks that silent request, a
  *Reconnect* banner appears; all changes are saved locally and synced when reconnected. (A refresh-token flow would
  need a backend.)
- **Reminders** fire while the app is open or running in the background as an installed PWA. Guaranteed delivery
  when fully closed would need a push server.
- **Forgot PIN** asks the user to sign in with the same Google account again, then set a new PIN.
- Export/Import: JSON file (PIN is never exported). Import can replace or merge.
- Logo → icons: `npm run icons` regenerates the PWA icons from `src/assets/logo-source.jpg`.
