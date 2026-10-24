// Google Identity Services (token model) + Drive appDataFolder + Gmail send.
// Data lives in the user's own hidden Drive "app data" folder, visible only to this app.

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const BASE_SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.appdata'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
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
export async function requestToken({ prompt = '', hint, scope = BASE_SCOPES } = {}) {
  const oauth2 = await waitForGis()
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

export const hasLiveToken = () => !!token && Date.now() < expiresAt - 60000

export async function ensureToken(hint) {
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

// ---------- Gmail (forgot PIN) ----------
const toB64Url = (str) => {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const encodeHeader = (s) => `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`

/** Must be called from a user gesture (it may open Google's consent popup the first time). */
export async function sendEmailToSelf(email, subject, text) {
  await requestToken({ prompt: '', hint: email, scope: `${BASE_SCOPES} ${GMAIL_SCOPE}` })
  const raw = toB64Url(
    [
      `To: ${email}`,
      `Subject: ${encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      text,
    ].join('\r\n'),
  )
  await api(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) },
    email,
  )
}
