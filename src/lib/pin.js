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

