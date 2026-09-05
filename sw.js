// Keep VERSION in step with APP_BUILD in ./src/version.js.
const VERSION = '2026.09.05-freshstart1'
const CACHE = `focus-${VERSION}`

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/app.css',
  './assets/fonts/lexend-400.woff2',
  './assets/fonts/lexend-700.woff2',
  './src/app.js',
  './src/version.js',
  './src/model.js',
  './src/stats.js',
  './src/storage.js',
  './src/sync.js',
  './src/journal.js',
  './src/journal-record.js',
  './src/ui.js',
  './src/icons.js',
  './src/timer-screen.js',
  './src/settings-screen.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
]

// Shared modules live in another repository but on the same origin, so they
// can be cached. Added one by one rather than with addAll: a single failure
// there must not stop the whole app from installing.
const OPTIONAL_ASSETS = [
  '../shared/v1/sync.js',
  '../shared/v2/journal.js',
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // cache: 'reload' bypasses the browser's own HTTP cache — without it, a
    // recently-visited asset can still be HTTP-cache-fresh and get copied
    // straight into the new versioned CACHE unchanged, silently defeating
    // the whole point of bumping VERSION on a real edit.
    await Promise.all(CORE_ASSETS.map(async (path) => {
      const response = await fetch(new URL(path, self.registration.scope), { cache: 'reload' })
      await cache.put(path, response)
    }))
    await Promise.all(OPTIONAL_ASSETS.map(async (path) => {
      try {
        const response = await fetch(new URL(path, self.registration.scope), { cache: 'reload' })
        await cache.put(path, response)
      } catch { /* the fetch handler caches it on a later run */ }
    }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('focus-') && key !== CACHE).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  // Cross-origin requests (Sync/Journal talk to https://api.github.com) are
  // left entirely alone — answering those from cache would let reads fail
  // while writes still went through, corrupting a merge.
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const cached = await cache.match(request)
    const refresh = fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') cache.put(request, response.clone())
        return response
      })
      .catch(() => null)

    if (cached) {
      event.waitUntil(refresh)
      return cached
    }

    const fresh = await refresh
    if (fresh) return fresh
    if (request.mode === 'navigate') {
      return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error()
    }
    return Response.error()
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = clientList.find((client) => new URL(client.url).origin === self.location.origin)
    if (existing) {
      await existing.focus()
      return
    }
    await self.clients.openWindow(self.registration.scope)
  })())
})
