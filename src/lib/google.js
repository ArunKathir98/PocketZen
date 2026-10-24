// Google Identity Services (token model) + Drive.
// Personal data lives in the user's own hidden Drive "app data" folder, visible only to this app.
// Shared groups are ordinary files PocketZen creates in the admin's Drive (drive.file scope), readable by
// anyone with the link; only the admin's signed-in app can change them.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY // lets people with a group link read it without signing in
const BASE_SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.appdata'
const FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GROUP_FLAG = 'pz:groupScope'

/** Only people who create groups are asked for the extra Drive permission. */
const scopes = () => (localStorage.getItem(GROUP_FLAG) === '1' ? `${BASE_SCOPES} ${FILE_SCOPE}` : BASE_SCOPES)
const FILE_NAME = 'pocketzen-data.json'

let token = null
let expiresAt = 0

export const hasClientId = () => !!CLIENT_ID && !CLIENT_ID.startsWith('your-')

function waitForGis(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
    const tick = () => {
      if (window.google?.accounts?.oauth2) return resolve(window.google.accounts.oauth2)
      if (Date.now() - t0 > timeout) return reject(new Error('Google sign-in could not load. Check your connection.'))
      setTimeout(tick, 100)
    }
    tick()
  })
}

/** Ask Google for an access token. prompt '' = silent when possible, 'consent' / 'select_account' = UI. */
export async function requestToken({ prompt = '', hint, scope } = {}) {
  const oauth2 = await waitForGis()
  scope = scope || scopes()
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope,
      hint,
      prompt,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error))
        token = resp.access_token
        expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000
        resolve(token)
      },
      error_callback: (err) => reject(new Error(err?.type || 'auth_failed')),
    })
    client.requestAccessToken()
  })
}

const hasLiveToken = () => !!token && Date.now() < expiresAt - 60000

async function ensureToken(hint) {
  if (hasLiveToken()) return token
  return requestToken({ prompt: '', hint })
}

export function signOutGoogle() {
  const t = token
  token = null
  expiresAt = 0
  if (t && window.google?.accounts?.oauth2) {
    try { window.google.accounts.oauth2.revoke(t, () => {}) } catch { /* ignore */ }
  }
}

async function api(url, opts = {}, hint) {
  const t = await ensureToken(hint)
  let res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${t}` } })
  if (res.status === 401) {
    token = null
    const t2 = await ensureToken(hint)
    res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${t2}` } })
  }
  if (!res.ok) {
    const e = new Error(`Google API ${res.status}`)
    e.status = res.status
    throw e
  }
  return res
}

export async function fetchProfile(hint) {
  const res = await api('https://www.googleapis.com/oauth2/v3/userinfo', {}, hint)
  const p = await res.json()
  return { sub: p.sub, email: p.email, name: p.name || p.email, picture: p.picture }
}

// ---------- Drive ----------
const fileIdKey = (sub) => `pz:fileId:${sub}`

async function findFile(sub, hint) {
  const cached = localStorage.getItem(fileIdKey(sub))
  if (cached) return cached
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`)
  const res = await api(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&pageSize=1`,
    {},
    hint,
  )
  const { files } = await res.json()
  if (files?.length) {
    localStorage.setItem(fileIdKey(sub), files[0].id)
    return files[0].id
  }
  return null
}

export async function driveLoad(sub, hint) {
  const id = await findFile(sub, hint)
  if (!id) return null
  try {
    const res = await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {}, hint)
    return await res.json()
  } catch (e) {
    if (e.status === 404) {
      localStorage.removeItem(fileIdKey(sub))
      return driveLoad(sub, hint)
    }
    throw e
  }
}

export async function driveSave(sub, data, hint) {
  const body = JSON.stringify(data)
  let id = await findFile(sub, hint)
  if (id) {
    try {
      await api(
        `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body },
        hint,
      )
      return
    } catch (e) {
      if (e.status !== 404) throw e
      localStorage.removeItem(fileIdKey(sub))
      id = null
    }
  }
  const boundary = 'pz' + Math.random().toString(36).slice(2)
  const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' })
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`
  const res = await api(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart },
    hint,
  )
  const created = await res.json()
  localStorage.setItem(fileIdKey(sub), created.id)
}

// ---------- Re-verify identity (forgot PIN) ----------
/** Must be called from a user gesture. Resolves true only if the same Google account signs in again. */
export async function reverifyAccount(expectedSub, hint) {
  await requestToken({ prompt: 'select_account', hint })
  const p = await fetchProfile(hint)
  return p.sub === expectedSub
}

// ---------- Shared groups (files in the admin's Drive) ----------
export const hasGroupScope = () => localStorage.getItem(GROUP_FLAG) === '1'
const hasApiKey = () => !!API_KEY && !API_KEY.startsWith('your-')

/** Ask for the extra Drive permission. Call straight from a click (it may open Google's consent popup). */
export async function enableGroupScope(hint) {
  const had = localStorage.getItem(GROUP_FLAG)
  localStorage.setItem(GROUP_FLAG, '1')
  try {
    return await requestToken({ prompt: '', hint })
  } catch (e) {
    if (!had) localStorage.removeItem(GROUP_FLAG)
    throw e
  }
}

const multipart = (meta, body) => {
  const boundary = 'pz' + Math.random().toString(36).slice(2)
  return {
    boundary,
    body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
  }
}

/** Creates the group's file in the admin's Drive and lets anyone with the link read it. Returns the file id. */
export async function createGroupFile(name, state, hint) {
  const m = multipart({ name: `PocketZen group - ${name}.json`, mimeType: 'application/json' }, JSON.stringify(state))
  const res = await api(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${m.boundary}` }, body: m.body },
    hint,
  )
  const { id } = await res.json()
  await api(
    `https://www.googleapis.com/drive/v3/files/${id}/permissions`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone', allowFileDiscovery: false }) },
    hint,
  )
  return id
}

/** Admin read/write (signed in). */
export async function readGroupFile(id, hint) {
  const res = await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {}, hint)
  return res.json()
}
export async function writeGroupFile(id, state, hint) {
  await api(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) }, hint)
}
export async function deleteGroupFile(id, hint) {
  await api(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' }, hint)
}

/** Anyone with the link: no sign-in, read-only. */
export async function readPublicGroupFile(id) {
  if (!hasApiKey()) {
    const e = new Error('no_key')
    e.code = 'no_key'
    throw e
  }
  let res
  try {
    res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&key=${API_KEY}`, { cache: 'no-store' })
  } catch {
    const e = new Error('offline')
    e.code = 'offline'
    throw e
  }
  if (!res.ok) {
    const e = new Error(`Google API ${res.status}`)
    e.code = res.status === 404 || res.status === 403 ? 'not_found' : 'error'
    throw e
  }
  return res.json()
}
