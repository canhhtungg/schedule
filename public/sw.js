const CACHE = 'kma-planner-v9'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/system-logo.png', '/system-logo-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(event.request, copy))
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html'))),
  )
})

self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data?.json() || {} } catch { payload = {} }
  const title = typeof payload.title === 'string' ? payload.title : ''
  const options = {
    body: typeof payload.body === 'string' ? payload.body : 'Bạn có một lịch sắp bắt đầu.',
    icon: '/system-logo-512.png',
    badge: '/system-logo-512.png',
    tag: typeof payload.tag === 'string' ? payload.tag : undefined,
    renotify: false,
    data: { url: typeof payload.data?.url === 'string' ? payload.data.url : '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  let target = new URL('/', self.location.origin)
  try {
    const candidate = new URL(event.notification.data?.url || '/', self.location.origin)
    if (candidate.origin === self.location.origin) target = candidate
  } catch { /* Keep the safe root target. */ }

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (existing) {
      if ('navigate' in existing) await existing.navigate(target.href)
      return existing.focus()
    }
    return self.clients.openWindow(target.href)
  }))
})
