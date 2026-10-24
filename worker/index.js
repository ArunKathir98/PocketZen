// PocketZen is a static app: this Worker only hands requests to the built files.
// (Shared groups live in the admin's Google Drive, so there is no API here.)
export default {
  fetch: (request, env) => env.ASSETS.fetch(request),
}
