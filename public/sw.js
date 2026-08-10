const VERSION = '2026.08.09-sync6'
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

// 공용 동기화 모듈. 다른 저장소에 있지만 같은 오리진이라 캐시할 수 있습니다.
// CORE_ASSETS 와 달리 하나씩 담습니다. addAll 은 하나만 실패해도 설치 전체가
// 실패하는데, 이 파일이 잠깐 안 열린다고 앱이 설치되지 못하면 안 됩니다.
const OPTIONAL_ASSETS = [
  '../shared/v1/sync.js',
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll(CORE_ASSETS)
    await Promise.all(OPTIONAL_ASSETS.map(async (path) => {
      try {
        await cache.add(new URL(path, self.registration.scope))
      } catch {
        // 다음 실행 때 fetch 핸들러가 다시 담습니다.
      }
    }))

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
    await Promise.all(keys.filter((key) => key.startsWith('focus-') && key !== CACHE).map((key) => caches.delete(key)))
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
