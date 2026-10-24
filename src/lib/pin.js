const enc = new TextEncoder()
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(secret, saltBytes) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 150000, hash: 'SHA-256' },
    key,
    256,
  )
  return b64(bits)
}

export async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { salt: b64(salt), hash: await derive(pin, salt) }
}

export async function verifyPin(pin, record) {
  if (!record) return false
  return (await derive(pin, unb64(record.salt))) === record.hash
}


// ---- one-time recovery code (used in local-only mode, where there is no Google account to re-verify) ----
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

export const normalizeCode = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function makeRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length])
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join('')).join('-')
}

export const hashRecovery = (code) => hashPin(normalizeCode(code))
export const verifyRecovery = (code, record) => verifyPin(normalizeCode(code), record)
