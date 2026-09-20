/**
 *  Turn-notification opt-in: service worker registration + Push API
 *  subscribe/unsubscribe, keyed to this device's persistent player identity
 *  (see storage.js). Every call is defensive -- push isn't supported on
 *  every browser (notably iOS Safari outside of an installed PWA), and none
 *  of this should ever block or break actual gameplay.
 */

function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function registerServiceWorker() {
    if (!pushSupported()) return Promise.resolve(null)

    return navigator.serviceWorker.register('/service-worker.js')
        .catch(function (err) {
            console.warn('Service worker registration failed: ' + err.message)
            return null
        })
}

// PushManager wants the VAPID key as a Uint8Array, the server hands it back
// base64url-encoded
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i)
    }

    return outputArray
}

async function getExistingSubscription() {
    if (!pushSupported()) return null

    const registration = await navigator.serviceWorker.ready
    return registration.pushManager.getSubscription()
}

// ****************************************************************
// true only once permission is actually granted AND a live subscription
// exists -- used to set the options-modal toggle's initial state
async function isTurnNotificationsEnabled() {
    if (!pushSupported()) return false
    if (Notification.permission !== 'granted') return false

    const subscription = await getExistingSubscription()
    return Boolean(subscription)
}

// ****************************************************************
// must be called from a real user gesture (click handler) -- browsers
// silently ignore or reject Notification.requestPermission() otherwise
async function enableTurnNotifications(playerID) {
    if (!pushSupported()) return false
    if (!playerID) return false

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
        const keyResponse = await fetch('/push/vapid-public-key')
        const { key } = await keyResponse.json()

        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(key)
        })
    }

    await fetch('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerID: playerID, subscription: subscription.toJSON() })
    })

    return true
}

async function disableTurnNotifications() {
    const subscription = await getExistingSubscription()
    if (!subscription) return

    const endpoint = subscription.endpoint
    await subscription.unsubscribe()

    await fetch('/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpoint })
    })
}
