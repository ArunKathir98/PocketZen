// Client for the shared-groups API (same origin as the app, served by the Cloudflare Worker).
async function call(method, path, body) {
  let res
  try {
    res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  } catch {
    const e = new Error('offline')
    e.code = 'offline'
    throw e
  }
  let data = null
  try { data = await res.json() } catch { /* not JSON (e.g. the dev server has no API) */ }
  if (!data) {
    const e = new Error('no_server')
    e.code = 'no_server'
    e.status = res.status
    throw e
  }
  if (!res.ok) {
    const e = new Error(data?.error || `http_${res.status}`)
    e.code = res.status === 404 && data?.error === 'not_found' ? 'not_found' : res.status === 413 ? 'too_large' : res.status === 400 ? 'bad_id' : 'error'
    e.status = res.status
    throw e
  }
  return data
}

export const createGroup = (name, currency) => call('POST', '/api/groups', { name, currency })
export const getGroup = (id, version) => call('GET', `/api/groups/${id}${version ? `?v=${version}` : ''}`)
export const postOps = (id, ops) => call('POST', `/api/groups/${id}/ops`, { ops })
export const deleteGroupRemote = (id) => call('POST', `/api/groups/${id}/delete`, {})
