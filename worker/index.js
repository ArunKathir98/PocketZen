// Cloudflare Worker: serves the app and the shared-groups API (/api/*).
// Each group is one Durable Object (SQLite-backed → free plan), addressed by its random 12-character ID.
// Anyone who knows the ID can read and edit the group – the ID is the "key".
import { applyOps, emptyGroup, GROUP_ID_ALPHABET, isGroupId, normalizeGroupId } from '../src/lib/groupState.js'

const IDLE_DELETE_MS = 365 * 24 * 3600 * 1000 // groups nobody touched for a year are erased
const MAX_BODY = 200_000

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export class GroupDO {
  constructor(ctx) {
    this.ctx = ctx
  }

  async save(state) {
    await this.ctx.storage.put('state', state)
    await this.ctx.storage.setAlarm(Date.now() + IDLE_DELETE_MS)
  }

  async alarm() {
    await this.ctx.storage.deleteAll()
  }

  async fetch(request) {
    const url = new URL(request.url)
    // Parse the body BEFORE touching storage: read → apply → write must not be interleaved with other requests.
    let body = {}
    if (request.method === 'POST') {
      try { body = await request.json() } catch { return json({ error: 'bad_json' }, 400) }
    }
    const state = await this.ctx.storage.get('state')

    if (url.pathname === '/init') {
      if (state) return json({ error: 'exists' }, 409)
      const s = emptyGroup(body.id, body.name, body.currency, Date.now())
      await this.save(s)
      return json({ state: s })
    }
    if (!state) return json({ error: 'not_found' }, 404)

    if (url.pathname === '/get') {
      const v = Number(url.searchParams.get('v'))
      return v === state.version ? json({ unchanged: true, version: state.version }) : json({ state })
    }
    if (url.pathname === '/ops') {
      const r = applyOps(state, body.ops)
      if (r.changed) await this.save(r.state)
      return json({ state: r.state, rejected: r.rejected })
    }
    if (url.pathname === '/delete') {
      await this.ctx.storage.deleteAll()
      return json({ ok: true })
    }
    return json({ error: 'not_found' }, 404)
  }
}

const randomId = () => {
  const b = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(b, (x) => GROUP_ID_ALPHABET[x % GROUP_ID_ALPHABET.length]).join('')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'too_large' }, 413)
    const stubFor = (id) => env.GROUPS.get(env.GROUPS.idFromName(id))

    // create a group
    if (url.pathname === '/api/groups' && request.method === 'POST') {
      let body
      try { body = await request.json() } catch { return json({ error: 'bad_json' }, 400) }
      for (let i = 0; i < 4; i += 1) {
        const id = randomId()
        const res = await stubFor(id).fetch('https://group/init', { method: 'POST', body: JSON.stringify({ id, name: body?.name, currency: body?.currency }) })
        if (res.status === 409) continue
        return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
      }
      return json({ error: 'try_again' }, 503)
    }

    const m = url.pathname.match(/^\/api\/groups\/([A-Za-z0-9-]{12,20})(\/ops|\/delete)?$/)
    if (!m) return json({ error: 'not_found' }, 404)
    const id = normalizeGroupId(m[1])
    if (!isGroupId(id)) return json({ error: 'bad_id' }, 400)
    const stub = stubFor(id)
    const sub = m[2] || ''

    if (!sub && request.method === 'GET') {
      const res = await stub.fetch(`https://group/get?v=${encodeURIComponent(url.searchParams.get('v') || '')}`)
      return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    }
    if ((sub === '/ops' || sub === '/delete') && request.method === 'POST') {
      const res = await stub.fetch(`https://group${sub}`, { method: 'POST', body: await request.text() })
      return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    }
    return json({ error: 'method_not_allowed' }, 405)
  },
}
