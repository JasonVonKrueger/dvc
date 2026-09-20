/* ************************************************************************************
    @desc - Web Push (VAPID) sending, keyed off a persistent player identity

    VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT come from the process
    environment (same convention as ADMIN_TOKEN in app.js) -- never committed to
    the repo. If they're unset, an ephemeral keypair is generated so local dev
    doesn't crash; subscriptions made against it won't survive a restart.
************************************************************************************ */
const webpush = require('web-push')
const store = require('./store')

let publicKey = process.env.VAPID_PUBLIC_KEY
let privateKey = process.env.VAPID_PRIVATE_KEY

if (!publicKey || !privateKey) {
    console.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set -- generating an ephemeral keypair for this process. Push subscriptions will need to be re-created after every restart. Set both env vars (see `npx web-push generate-vapid-keys`) to fix this.')
    let generated = webpush.generateVAPIDKeys()
    publicKey = generated.publicKey
    privateKey = generated.privateKey
}

webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@davincischallenge.app',
    publicKey,
    privateKey
)

// ****************************************************************
// send a push to every device a player identity has subscribed on. Best
// effort: a dead subscription (device unsubscribed, browser data cleared,
// etc.) is pruned rather than treated as an error.
async function sendTurnNotification(playerID, payload) {
    let subscriptions = store.getSubscriptionsForPlayer(playerID)

    await Promise.all(subscriptions.map(async function (row) {
        let subscription = {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth }
        }

        try {
            await webpush.sendNotification(subscription, JSON.stringify(payload))
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
                store.removeSubscription(row.endpoint)
            } else {
                console.error('Push send error:', err.message)
            }
        }
    }))
}

module.exports = {
    getPublicKey: function () { return publicKey },
    sendTurnNotification
}
