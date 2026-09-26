/**
 *  PWA plumbing shared by the game (index.html) and the marketing page
 *  (market.html): service worker registration and the custom "Install app"
 *  button. Like push.js, everything here is defensive -- install support
 *  varies a lot by browser and none of it should ever break the page.
 *
 *  Markup contract: an element with [data-install-button] starts out with
 *  the hidden attribute and is only revealed when installing is actually
 *  possible. An optional [data-install-hint] holds "Share -> Add to Home
 *  Screen" instructions for iOS, which has no install prompt to trigger.
 */

let deferredInstallPrompt = null

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null)

    return navigator.serviceWorker.register('/service-worker.js')
        .catch(function (err) {
            console.warn('Service worker registration failed: ' + err.message)
            return null
        })
}

function isRunningInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function isIOS() {
    // iPadOS reports itself as a Mac -- touch support is what gives it away
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function canOfferInstall() {
    if (isRunningInstalled()) return false
    return deferredInstallPrompt !== null || isIOS()
}

function refreshInstallButtons() {
    const show = canOfferInstall()

    document.querySelectorAll('[data-install-button]').forEach(function (btn) {
        btn.hidden = !show
    })

    if (!show) {
        document.querySelectorAll('[data-install-hint]').forEach(function (hint) {
            hint.hidden = true
        })
    }
}

async function onInstallButtonClick() {
    if (deferredInstallPrompt) {
        const promptEvent = deferredInstallPrompt
        // a prompt event can only be used once, whatever the user picks
        deferredInstallPrompt = null

        try {
            await promptEvent.prompt()
            await promptEvent.userChoice
        } catch (err) {
            console.warn('Install prompt failed: ' + err.message)
        }

        refreshInstallButtons()
        return
    }

    // iOS: nothing to trigger programmatically, so show how to do it by hand
    document.querySelectorAll('[data-install-hint]').forEach(function (hint) {
        hint.hidden = !hint.hidden
    })
}

// Called once the install button markup is in the DOM. On index.html that's
// after the data-include fragments load, which can be after the browser has
// already fired beforeinstallprompt -- hence the stashed event + refresh.
function initInstallButtons() {
    document.querySelectorAll('[data-install-button]').forEach(function (btn) {
        btn.addEventListener('click', onInstallButtonClick)
    })

    refreshInstallButtons()
}

// Chromium browsers only. Suppressing the default mini-infobar keeps the
// install offer on our own button instead of a browser banner over the game.
window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault()
    deferredInstallPrompt = e
    refreshInstallButtons()
})

window.addEventListener('appinstalled', function () {
    deferredInstallPrompt = null
    refreshInstallButtons()
})
