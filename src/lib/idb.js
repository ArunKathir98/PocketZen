// Small key-value store on IndexedDB (much larger quota than localStorage).
// Falls back to localStorage if IndexedDB is unavailable (e.g. some private modes).
const DB = 'pocketzen'
const STORE = 'kv'
let dbp

const open = () =>
  (dbp ||= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'))
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  }))

const lsKey = (k) => `pz:kv:${k}`

export async function idbGet(k) {
  try {
    const db = await open()
    return await new Promise((resolve, reject) => {
      const q = db.transaction(STORE).objectStore(STORE).get(k)
      q.onsuccess = () => resolve(q.result)
      q.onerror = () => reject(q.error)
    })
  } catch {
    try {
      return JSON.parse(localStorage.getItem(lsKey(k)))
    } catch {
      return undefined
    }
  }
}

export async function idbSet(k, v) {
  try {
    const db = await open()
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite')
      t.objectStore(STORE).put(v, k)
      t.oncomplete = resolve
      t.onerror = () => reject(t.error)
    })
  } catch {
    try { localStorage.setItem(lsKey(k), JSON.stringify(v)) } catch { /* storage full */ }
  }
}

export async function idbDel(k) {
  try {
    const db = await open()
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite')
      t.objectStore(STORE).delete(k)
      t.oncomplete = resolve
      t.onerror = () => reject(t.error)
    })
  } catch { /* fall through */ }
  try { localStorage.removeItem(lsKey(k)) } catch { /* ignore */ }
}
