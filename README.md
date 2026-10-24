# PocketZen — Your Money. Your Control.

A personal finance app (React + Vite, installable PWA) for phone, tablet and desktop. Your records live in **your own
Google Drive** (or only on your device if you prefer no account). There is no PocketZen server or database.

Live app: https://pocketzen.arunkumar98kak.workers.dev/ · Version 1.0

## What it does

| Page | |
|---|---|
| **Records** | Income, expenses and transfers; daily / weekly / monthly views; per-category history |
| **Categories** | Add, edit, remove; tap one to see all its transactions |
| **Accounts** | Banks, wallets, cash, investments, with live balances |
| **Budget** | Monthly limit per expense category; remaining balance shown while adding an expense |
| **EMIs** | Ongoing loans: total, months, pending months, payments, schedule |
| **Loans & people** | Money lent or borrowed; interest (none, fixed monthly, simple %, compound %, manual); statements |
| **Groups** | Split expenses with friends. You manage the group; others get a **view-only link**. Settle-up suggestions and a PDF summary |
| **Reminders** | Recurring bill reminders, plus an optional daily "add today's expenses" nudge |
| **Profile** | Light / dark theme, currency, PIN lock, notifications (sound & vibration), backup & restore, share |

Also: PIN lock, password-protected backups, install prompt, offline use, in-app dialogs (no browser pop-ups).

### Two ways to use it

| | Sign in with Google | Without an account |
|---|---|---|
| Pages | Everything above (EMIs, Loans, Reminders and Groups are switched on in Profile → Pages) | Records, Categories, Accounts, Profile |
| Data | Your Drive app-data folder, synced across devices | On this device only (IndexedDB) |
| Backup | Automatic (Drive) | Backup file (optionally password-protected); a reminder after 14 days |
| Forgot PIN | Sign in with Google again | One-time recovery code |
| Moving over | "Connect Google Drive" in Profile uploads or merges your device data | |

### How groups work (no server)

- The admin (a Google user) creates a group. PocketZen saves it as a file `PocketZen group - <name>.json` in the
  admin's Drive. It is **private** until the admin taps **Invite**, which turns on "anyone with the link can view".
  The group ID is that file's ID.
- Anyone with the link `…/?view=<id>` sees the expenses, balances and who-pays-whom, **read-only, no sign-in**. They can
  download or share the PDF. Signed-in users can also save the group to their list and pick which person they are.
- Only the admin can add or edit expenses, payments, people and events, and tick suggested payments as paid.
  Admin edits are queued offline and saved to Drive when back online.
- Viewers refresh about every 30 s. Deleting the group deletes the file; sharing stops immediately.
- Splitting is equal between the people chosen; amounts are handled in whole cents so shares always add up.
- **Sharing needs the API key.** Join, Invite and view links appear only when `VITE_GOOGLE_API_KEY` was set at build time.
  Without it they are hidden and groups still work privately for the admin (expenses, settle-up, PDF). To switch sharing
  off even when the key exists, set `GROUP_SHARING = false` in `src/config.js`.

## Setup

### 1. Google Cloud (once)

1. Create a project at https://console.cloud.google.com and enable the **Google Drive API**.
2. **Google Auth Platform**: app name *PocketZen*, support email, home page `https://<your-domain>/home.html`,
   privacy policy `https://<your-domain>/privacy.html`. Data Access scopes (all non-sensitive):
   `openid`, `email`, `profile`, `…/auth/drive.appdata`, `…/auth/drive.file`.
   While testing, add yourself under **Test users**; **Publish app** when ready.
3. **Credentials → OAuth client ID → Web application.** Authorized JavaScript origins: `http://localhost:5173` and your
   production origin (no trailing slash).
4. **Credentials → API key** (optional; it turns on group sharing, used so people with a group link can read it without signing in). Under
   *Application restrictions* choose **Websites** and add your origins (`https://<your-domain>/*`,
   `http://localhost:5173/*`); under *API restrictions* choose **Google Drive API**.

### 2. Environment

Copy `.env.example` to `.env`:

```
VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIza…
```

Both are public by design (they are visible in any web app). Never put a client *secret* in this project; none is used.

### 3. Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build + service worker
npm run preview    # test the installable PWA build
```

### 4. Deploy (Cloudflare Workers, free)

Connect the GitHub repo in Cloudflare (Workers & Pages → Create → Import a repository):

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Build variables | `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `NODE_VERSION=22` |

The variables must be **build** variables because Vite inlines them at build time. Add the deployed origin to the OAuth
client's origins and the API key's referrers. Every push to `main` redeploys.

`wrangler.jsonc` serves `dist/` as static assets. It also carries a migration that retires `GroupDO`, a Durable Object
from an earlier server-based groups prototype; keep it.

## Tools

```bash
npm run icons      # regenerate PWA icons from src/assets/logo-source.jpg
npm run poster -- https://your-app-url --form https://forms.gle/xxxx   # shareable poster + QR (needs a build first)
```

`src/config.js` holds the feedback form link and the group-sharing switch. The poster script also refreshes `public/share-poster.jpg`, which the
in-app Share button attaches.

## Project layout

```
src/pages        Records, Categories, Accounts, Budget, Emi, Loans, Groups (+ GroupView, PublicGroup), Reminders, User, Login, PinLock
src/components   dialogs, modals, banners, backup / recovery / notification / share cards
src/lib          store (data + sync), google (Drive), idb, backup, merge, loans, emi, groupState, groupPdf, useGroup, reminders, notify
public           icons, service-worker helper, home.html, privacy.html
scripts          icon generator, poster generator
```

## Notes & limits

- **Stay signed in:** the session never expires; only *Log out* ends it. Google access tokens last about an hour, so the
  app quietly renews one only when it has expired. A still-valid token is kept on the device (cleared on logout), so
  reloads and reopening the app don't open Google's sign-in window again. Timers and focus changes never open it on
  their own. If the browser blocks a renewal, a *Reconnect* banner appears and changes keep saving on the device. Several devices merge their changes instead of overwriting each other (a deletion made on one device can come back
  if another device edits the same data first).
- **Reminders** alert while the app is open or running in the background as an installed PWA. A website can't schedule
  alerts for a closed or locked phone, and can't choose its own notification sound (the phone's setting applies).
- **Groups** need the admin to be signed in to Drive to change anything; the API key has a shared daily quota, which is
  plenty for friends-and-family use.
- Backups never include the PIN. Without an account, a lost recovery code and lost backup cannot be recovered.
