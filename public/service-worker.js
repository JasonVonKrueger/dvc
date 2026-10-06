/**
 *  Service worker: receives Web Push events while the app isn't open, routes
 *  a notification tap back into the right game, and shows an offline page
 *  when a page load fails for lack of a network.
 *
 *  Deliberately NOT an offline cache for the game itself -- every mode talks
 *  to the server (game state, SSE), so only offline.html and the few assets
 *  it uses are precached. Everything else goes straight to the network.
 */

// bump the version whenever offline.html or OFFLINE_ASSETS change, so
// installs pick up the new copy and activate clears out the old one
const CACHE_NAME = 'dvc-offline-v1'
const OFFLINE_URL = '/offline.html'
const OFFLINE_ASSETS = [
    OFFLINE_URL,
    '/resources/images/icons/icon-192.png',
    '/resources/fonts/Copperplate-Gothic-Medium.ttf'
]

self.addEventListener('install', function (event) {
    event.waitUntil((async function () {
        let cache = await caches.open(CACHE_NAME)
        // cache: 'reload' skips the HTTP cache so a stale copy never gets precached
        await cache.addAll(OFFLINE_ASSETS.map(function (url) {
            return new Request(url, { cache: 'reload' })
        }))
        await self.skipWaiting()
    })())
})

self.addEventListener('activate', function (event) {
    event.waitUntil((async function () {
        let keys = await caches.keys()
        await Promise.all(keys.filter(function (key) {
            return key.startsWith('dvc-') && key !== CACHE_NAME
        }).map(function (key) {
            return caches.delete(key)
        }))

        // lets page loads start their network request while the worker is
        // still booting, instead of waiting on it
        if (self.registration.navigationPreload) {
            await self.registration.navigationPreload.enable()
        }

        await self.clients.claim()
    })())
})

self.addEventListener('fetch', function (event) {
    // offline.html's own icon/font: network as normal, cached copy only when
    // that fails -- otherwise the offline page would render with them broken
    let url = new URL(event.request.url)
    let path = url.pathname
    if (event.request.mode !== 'navigate' && url.origin === self.location.origin && OFFLINE_ASSETS.includes(path)) {
        event.respondWith(fetch(event.request).catch(async function () {
            let cache = await caches.open(CACHE_NAME)
            return (await cache.match(path)) || Response.error()
        }))
        return
    }

    // otherwise only page loads get the offline fallback; API calls, SSE
    // streams and other assets are left alone entirely (no respondWith =
    // normal network fetch)
    if (event.request.mode !== 'navigate') return

    event.respondWith((async function () {
        try {
            let preloaded = await event.preloadResponse
            if (preloaded) return preloaded

            return await fetch(event.request)
        } catch (err) {
            // a network failure -- an HTTP error status (404, 500) resolves
            // normally above and is passed through as-is
            let cache = await caches.open(CACHE_NAME)
            return await cache.match(OFFLINE_URL)
        }
    })())
})

self.addEventListener('push', function (event) {
    let data = {}
    try {
        data = event.data ? event.data.json() : {}
    } catch (err) {
        data = { title: "It's your turn!", body: event.data ? event.data.text() : '' }
    }

    event.waitUntil((async function () {
        let windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

        // always show a notification -- Safari revokes the push subscription
        // after a few pushes that don't display one, so skipping it while the
        // game is open would silently break notifications later. If the page
        // is focused it already got this update over SSE, so show it quietly
        // (no sound/vibration) instead. The per-game tag keeps it to one
        // notification per game rather than a stack.
        let alreadyFocused = windows.some(function (client) { return client.focused })

        await self.registration.showNotification(data.title || "It's your turn!", {
            body: data.body || '',
            icon: '/resources/images/icons/icon-192.png',
            badge: '/resources/images/icons/badge-96.png',
            tag: data.gameID ? ('dvc-turn-' + data.gameID) : 'dvc-turn',
            // renotify + silent together is an error in Chrome
            silent: alreadyFocused,
            renotify: !alreadyFocused,
            data: { url: data.url || '/index.html' }
        })
    })())
})

self.addEventListener('notificationclick', function (event) {
    event.notification.close()
    let url = (event.notification.data && event.notification.data.url) || '/index.html'

    event.waitUntil((async function () {
        let windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

        for (let i = 0; i < windows.length; i++) {
            let client = windows[i]
            if ('focus' in client) {
                await client.focus()
                if ('navigate' in client) {
                    await client.navigate(url)
                }
                return
            }
        }

        await self.clients.openWindow(url)
    })())
})
