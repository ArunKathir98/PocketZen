// Tiny SVG helpers + the diagrams used in docs/architecture. Output is plain inline SVG (vector, selectable text).
const FONT = "font-family=\"'Segoe UI', Roboto, Arial, sans-serif\""
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const PALETTE = {
  ink: '#0b2b33', muted: '#5c7780', line: '#7fa3aa',
  mint: '#d9fbe6', teal: '#c9f1f7', sky: '#dbeafe', sand: '#fff3d6', rose: '#ffe0e4', violet: '#ece4ff', grey: '#eef3f4', white: '#ffffff',
}

const defs = `<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${PALETTE.line}"/></marker></defs>`

/** Wraps text into lines of at most `max` characters. */
const wrap = (text, max) => {
  const out = []
  for (const para of String(text).split('\n')) {
    let line = ''
    for (const w of para.split(' ')) {
      if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w } else line = (line + ' ' + w).trim()
    }
    out.push(line)
  }
  return out
}

const box = (x, y, w, h, text, { fill = PALETTE.white, stroke = PALETTE.line, size = 11.5, weight = 500, color = PALETTE.ink, sub, rx = 10, dash } = {}) => {
  const chars = Math.max(8, Math.floor(w / (size * 0.56)))
  const lines = wrap(text, chars)
  const subLines = sub ? wrap(sub, Math.floor(w / ((size - 1.5) * 0.56))) : []
  const total = lines.length * (size + 3) + subLines.length * (size + 1)
  let ty = y + (h - total) / 2 + size
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"${dash ? ' stroke-dasharray="5 4"' : ''}/>`
  for (const l of lines) { s += `<text x="${x + w / 2}" y="${ty}" text-anchor="middle" font-size="${size}" font-weight="${weight}" fill="${color}" ${FONT}>${esc(l)}</text>`; ty += size + 3 }
  for (const l of subLines) { s += `<text x="${x + w / 2}" y="${ty}" text-anchor="middle" font-size="${size - 1.5}" fill="${PALETTE.muted}" ${FONT}>${esc(l)}</text>`; ty += size + 1 }
  return s
}
const arrow = (x1, y1, x2, y2, { dash, label, lx, ly } = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${PALETTE.line}" stroke-width="1.5" marker-end="url(#ar)"${dash ? ' stroke-dasharray="5 4"' : ''}/>` +
  (label ? `<text x="${lx ?? (x1 + x2) / 2 + 6}" y="${ly ?? (y1 + y2) / 2}" font-size="10" fill="${PALETTE.muted}" ${FONT}>${esc(label)}</text>` : '')
const text = (x, y, t, { size = 12, weight = 600, color = PALETTE.ink, anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" ${FONT}>${esc(t)}</text>`
const svg = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" xmlns="http://www.w3.org/2000/svg">${defs}${body}</svg>`

/** Sequence-style diagram: lanes (columns) with numbered steps flowing top to bottom. */
function lanes({ lanes: names, steps, width = 700, row = 62, top = 46 }) {
  const lw = width / names.length
  const h = top + steps.length * row + 14
  let s = ''
  names.forEach((n, i) => {
    s += `<rect x="${i * lw + 4}" y="4" width="${lw - 8}" height="26" rx="8" fill="${PALETTE.ink}"/>`
    s += text(i * lw + lw / 2, 21, n, { size: 11.5, color: '#fff', anchor: 'middle' })
    s += `<line x1="${i * lw + lw / 2}" y1="32" x2="${i * lw + lw / 2}" y2="${h - 6}" stroke="#d6e4e6" stroke-width="1" stroke-dasharray="3 5"/>`
  })
  const pos = steps.map((st, i) => ({ x: st.lane * lw + 10, y: top + i * row, w: lw - 20, h: row - 14 }))
  pos.forEach((p, i) => {
    const st = steps[i]
    if (i > 0) {
      const a = pos[i - 1]
      s += arrow(a.x + a.w / 2, a.y + a.h, p.x + p.w / 2, p.y, { dash: st.dashed })
    }
  })
  pos.forEach((p, i) => {
    const st = steps[i]
    s += box(p.x, p.y, p.w, p.h, st.t, { fill: st.fill || PALETTE.white, size: 10.5, rx: 8 })
    s += `<circle cx="${p.x + 2}" cy="${p.y + 2}" r="9" fill="${PALETTE.ink}"/>` + text(p.x + 2, p.y + 6, String(i + 1), { size: 10, color: '#fff', anchor: 'middle' })
  })
  return svg(width, h, s)
}

export const diagrams = {
  /* ------------------------------------------------------------------ layers */
  layers: () => {
    const W = 700
    let s = ''
    const row = (y, h, title, items, fill) => {
      s += `<rect x="10" y="${y}" width="${W - 20}" height="${h}" rx="14" fill="${fill}" stroke="${PALETTE.line}" stroke-width="1.2"/>`
      s += text(24, y + 20, title, { size: 12.5 })
      const n = items.length
      const gap = 8
      const bw = (W - 48 - gap * (n - 1)) / n
      items.forEach((it, i) => { s += box(24 + i * (bw + gap), y + 30, bw, h - 42, it[0], { fill: '#fff', size: 10.5, sub: it[1], rx: 8 }) })
    }
    row(8, 74, '1 · Browser shell (static files, no server code)', [['index.html', 'theme + Google script'], ['main.jsx', 'boot + providers'], ['Service worker', 'offline + notifications'], ['manifest', 'installable PWA']], PALETTE.grey)
    row(98, 86, '2 · Pages (what the user sees)', [['Records', 'Categories, Accounts'], ['Budget, EMIs', 'Loans, Reminders'], ['Groups', 'GroupView, PublicGroup'], ['Profile', 'Login, PinLock']], PALETTE.mint)
    row(200, 74, '3 · Shared components', [['Modal stack', 'ui.jsx'], ['Dialogs', 'confirm / choose'], ['Forms', 'AddSheet, Backup…'], ['Banners', 'install, notify, backup']], PALETTE.teal)
    row(290, 74, '4 · State (React Context + hooks)', [['store.jsx', 'AppProvider · useApp'], ['useGroup.js', 'live group + outbox'], ['dialog.jsx', 'DialogProvider'], ['install.js', 'useInstall']], PALETTE.sky)
    row(380, 86, '5 · Domain logic (pure functions, easy to test)', [['calc · emi', 'balances, periods'], ['loans', 'interest engine'], ['groupState', 'ops, splits, settle'], ['merge · backup', 'combine, encrypt'], ['pin · reminders', 'hash, schedule']], PALETTE.sand)
    row(482, 74, '6 · Platform services', [['google.js', 'sign-in + Drive REST'], ['idb.js', 'IndexedDB'], ['notify.js', 'sound + alerts'], ['groupPdf.js', 'canvas → PDF']], PALETTE.violet)
    row(572, 74, '7 · Storage (all on the user\'s side)', [['IndexedDB', 'data, group caches'], ['localStorage', 'session, flags, token'], ['Drive app-data', 'pocketzen-data.json'], ['Drive file', 'one per shared group']], PALETTE.rose)
    for (const y of [82, 184, 274, 364, 466, 556]) s += arrow(W / 2, y + 2, W / 2, y + 14)
    return svg(W, 654, s)
  },

  /* ------------------------------------------------------------------ boot / routing */
  boot: () => {
    let s = ''
    const step = (x, y, w, h, t, o) => { s += box(x, y, w, h, t, o) }
    step(230, 6, 240, 38, 'Page loads  (index.html → main.jsx)', { fill: PALETTE.grey })
    step(230, 62, 240, 44, 'AppProvider reads pz:session\nloads data from IndexedDB', { fill: PALETTE.sky })
    step(230, 124, 240, 34, 'ready = false → splash logo', { fill: PALETTE.white })
    step(230, 176, 240, 40, 'Signed in and PIN set?', { fill: PALETTE.sand })
    step(536, 176, 150, 40, 'PinLock screen', { fill: PALETTE.rose })
    step(230, 234, 240, 40, 'Group link (?view=id) and no\nGoogle session? (sharing on)', { fill: PALETTE.sand })
    step(536, 234, 150, 40, 'PublicGroup (read-only)', { fill: PALETTE.mint })
    step(230, 292, 240, 36, 'No session at all?', { fill: PALETTE.sand })
    step(536, 292, 150, 36, 'Login page', { fill: PALETTE.mint })
    step(230, 346, 240, 44, 'App shell: sidebar / bottom nav\n+ the selected page', { fill: PALETTE.mint })
    step(14, 346, 190, 44, 'Google session: pull from Drive\nin the background', { fill: PALETTE.teal, size: 10.5 })
    step(14, 408, 190, 44, 'Lite (local) session: only\nRecords · Categories · Accounts', { fill: PALETTE.teal, size: 10.5 })
    for (const [a, b] of [[44, 62], [106, 124], [158, 176], [216, 234], [274, 292], [328, 346]]) s += arrow(350, a, 350, b)
    s += arrow(470, 196, 536, 196, { label: 'yes', lx: 490, ly: 190 })
    s += arrow(470, 254, 536, 254, { label: 'yes', lx: 490, ly: 248 })
    s += arrow(470, 310, 536, 310, { label: 'yes', lx: 490, ly: 304 })
    s += arrow(230, 368, 204, 368, { dash: true })
    s += arrow(230, 380, 204, 425, { dash: true })
    s += text(356, 230, 'no', { size: 10, weight: 500, color: PALETTE.muted })
    return svg(700, 470, s)
  },

  /* ------------------------------------------------------------------ write pipeline */
  write: () =>
    lanes({
      lanes: ['UI (page / form)', 'store.jsx', 'Device storage', 'Google Drive'],
      steps: [
        { lane: 0, t: 'User taps Save → calls add / update / remove', fill: PALETTE.mint },
        { lane: 1, t: 'commit(fn): next = fn(data) + updatedAt', fill: PALETTE.sky },
        { lane: 1, t: 'dataRef updated, React state set (UI re-renders at once)', fill: PALETTE.sky },
        { lane: 2, t: 'IndexedDB: data:<sub> saved (works offline)', fill: PALETTE.rose },
        { lane: 2, t: 'pz:dirty:<sub> = 1 (Google users only)', fill: PALETTE.rose },
        { lane: 1, t: 'schedulePush(1.5 s) — waits for more edits', fill: PALETTE.sky },
        { lane: 3, t: 'push(): read Drive file; if newer than pz:synced → mergeData', fill: PALETTE.sand },
        { lane: 3, t: 'Write merged file, then clear dirty, set synced', fill: PALETTE.sand },
      ],
    }),

  /* ------------------------------------------------------------------ auth */
  auth: () =>
    lanes({
      lanes: ['User', 'App (store + google.js)', 'Google Identity', 'Device'],
      steps: [
        { lane: 0, t: 'Taps "Continue with Google"', fill: PALETTE.mint },
        { lane: 1, t: 'requestToken({ prompt: "select_account" })', fill: PALETTE.sky },
        { lane: 2, t: 'Popup: choose account + consent → access token (≈ 1 h)', fill: PALETTE.sand },
        { lane: 3, t: 'Token + expiry cached in pz:tok', fill: PALETTE.rose },
        { lane: 1, t: 'fetchProfile() → { sub, email, name, picture }', fill: PALETTE.sky },
        { lane: 3, t: 'Session saved in pz:session (never expires)', fill: PALETTE.rose },
        { lane: 1, t: 'startSession → loadData(sub) → pull() from Drive', fill: PALETTE.sky },
        { lane: 1, t: 'Later: reuse pz:tok; renew only when expired', fill: PALETTE.sky, dashed: true },
      ],
    }),

  /* ------------------------------------------------------------------ groups */
  groups: () =>
    lanes({
      lanes: ['Admin (Google user)', 'Admin\'s Google Drive', 'Viewer (anyone)'],
      steps: [
        { lane: 0, t: 'New group → enableGroupScope() asks for drive.file once', fill: PALETTE.mint },
        { lane: 1, t: 'createGroupFile(): "PocketZen group - Trip.json" — private', fill: PALETTE.sand },
        { lane: 0, t: 'Adds people / events / expenses → outbox → applyOps → writeGroupFile', fill: PALETTE.mint },
        { lane: 0, t: 'Taps Invite → shareGroupFile(): "anyone with the link can view"', fill: PALETTE.mint },
        { lane: 2, t: 'Opens  …/?view=<fileId>  (capturePendingJoin)', fill: PALETTE.sky },
        { lane: 1, t: 'GET files/<id>?alt=media&key=API_KEY (no sign-in)', fill: PALETTE.sand },
        { lane: 2, t: 'PublicGroup / GroupView(readOnly) shows balances, settle-up, PDF', fill: PALETTE.sky },
        { lane: 2, t: 'Polls every 30 s; cached copy in IndexedDB when offline', fill: PALETTE.sky, dashed: true },
      ],
    }),

  /* ------------------------------------------------------------------ modes */
  modes: () => {
    let s = ''
    s += box(10, 10, 300, 110, 'Local-only ("lite") session', { fill: PALETTE.mint, size: 13, weight: 700, sub: 'sub = "local" · data only in IndexedDB · pages: Records, Analysis, Categories, Accounts, Profile' })
    s += box(390, 10, 300, 110, 'Google session', { fill: PALETTE.sky, size: 13, weight: 700, sub: 'sub = Google id · IndexedDB + Drive app-data · all pages (optional ones switched on in Profile)' })
    s += arrow(312, 50, 388, 50, { label: 'Connect Google Drive', lx: 318, ly: 42 })
    s += arrow(388, 92, 312, 92, { label: 'Stop syncing', lx: 330, ly: 108, dash: true })
    s += box(10, 150, 300, 70, 'switchToGoogle(profile, next)', { fill: '#fff', size: 11, sub: 'Drive empty → upload · Drive has data → Merge / Keep Drive / Replace' })
    s += box(390, 150, 300, 70, 'disconnectGoogle()', { fill: '#fff', size: 11, sub: 'full copy stays on the device; the Drive file is left untouched' })
    return svg(700, 232, s)
  },
}
