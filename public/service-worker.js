/**
 *  Service worker: exists solely to receive Web Push events while the app
 *  isn't open, and to route a notification tap back into the right game.
 *  No caching/offline behavior here -- that's a separate concern.
 */

self.addEventListener('install', function (event) {
    self.skipWaiting()
})

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim())
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

        // the page already got this update live over SSE if it's open and
        // focused -- showing a native notification on top of that is just
        // noise, so only surface one when nothing's actively being looked at
        let alreadyFocused = windows.some(function (client) { return client.focused })
        if (alreadyFocused) return

        await self.registration.showNotification(data.title || "It's your turn!", {
            body: data.body || '',
            icon: 'resources/images/ios/touch-icon-iphone.png',
            badge: 'resources/images/ios/touch-icon-iphone.png',
            tag: data.gameID ? ('dvc-turn-' + data.gameID) : 'dvc-turn',
            renotify: true,
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
