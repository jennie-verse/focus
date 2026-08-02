const VERSION = '2026.08.01-focus3'
const CACHE = `focus-${VERSION}`

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/lexend-400.woff2',
  './fonts/lexend-700.woff2',
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll(CORE_ASSETS)

    const response = await fetch('./index.html', { cache: 'no-store' })
    if (response.ok) {
      const html = await response.clone().text()
      await cache.put('./index.html', response)
      const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((path) => path.includes('/assets/'))
      await Promise.all(paths.map(async (path) => {
        try {
          await cache.add(new URL(path, self.registration.scope))
        } catch {
          // One optional asset must not block the offline shell installation.
        }
      }))
    }

    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

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
