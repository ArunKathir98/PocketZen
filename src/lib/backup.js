import { download, todayStr } from './util'

const enc = new TextEncoder()
const dec = new TextDecoder()

const b64 = (buf) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function keyFrom(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Plain backup object (the PIN is never included). */
export function buildBackup(data) {
  const { pin: _pin, ...rest } = data
  return { app: 'PocketZen', exportedAt: new Date().toISOString(), ...rest }
}

export async function serializeBackup(data, password) {
  const obj = buildBackup(data)
  if (!password) return JSON.stringify(obj, null, 2)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFrom(password, salt)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)))
  return JSON.stringify({ app: 'PocketZen', encrypted: true, v: 1, salt: b64(salt), iv: b64(iv), data: b64(ct) })
}

/** Throws Error('invalid' | 'password_required' | 'bad_password'). */
export async function parseBackup(text, password) {
  let o
  try {
    o = JSON.parse(text)
  } catch {
    throw new Error('invalid')
  }
  if (o?.app !== 'PocketZen') throw new Error('invalid')
  if (o.encrypted) {
    if (!password) throw new Error('password_required')
    try {
      const key = await keyFrom(password, unb64(o.salt))
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.data))
      o = JSON.parse(dec.decode(pt))
    } catch {
      throw new Error('bad_password')
    }
  }
  if (!Array.isArray(o.transactions)) throw new Error('invalid')
  return o
}

export const isEncryptedText = (text) => {
  try { return JSON.parse(text)?.encrypted === true } catch { return false }
}

/**
 * Saves a backup: the phone's share sheet when it can take files (Files, Drive, WhatsApp, email…),
 * otherwise a normal download. Resolves 'shared' | 'downloaded' | 'cancelled'.
 */
export async function saveBackupFile(data, password) {
  const text = await serializeBackup(data, password)
  const name = `pocketzen-backup-${todayStr()}${password ? '-protected' : ''}.json`
  // text/plain is accepted by far more share targets than application/json
  const file = new File([text], name, { type: 'text/plain' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'PocketZen backup' })
      return 'shared'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'
    }
  }
  download(name, text)
  return 'downloaded'
}
