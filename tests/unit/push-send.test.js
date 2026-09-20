const assert = require('assert')
const webpush = require('web-push')
const { setupTestDb, store, db } = require('../helpers/db-helper')
const push = require('../../lib/push')

console.log('Running unit tests for push send/prune behavior...')

setupTestDb()
db.exec(`DELETE FROM push_subscriptions WHERE player_id LIKE 'PushSendTest%'`)

async function run() {
    // Test 1: sends to every stored subscription for the player
    store.saveSubscription('PushSendTest1', {
        endpoint: 'https://push.example.com/send-test-a',
        keys: { p256dh: 'a-p256dh', auth: 'a-auth' }
    })
    store.saveSubscription('PushSendTest1', {
        endpoint: 'https://push.example.com/send-test-b',
        keys: { p256dh: 'b-p256dh', auth: 'b-auth' }
    })

    let sentTo = []
    webpush.sendNotification = async function (subscription) {
        sentTo.push(subscription.endpoint)
    }

    await push.sendTurnNotification('PushSendTest1', { title: 'test' })
    assert.strictEqual(sentTo.length, 2, 'Should send to both of this player\'s subscriptions')

    // Test 2: a 410 Gone prunes that subscription, without touching others
    webpush.sendNotification = async function (subscription) {
        if (subscription.endpoint === 'https://push.example.com/send-test-a') {
            let err = new Error('gone')
            err.statusCode = 410
            throw err
        }
    }

    await push.sendTurnNotification('PushSendTest1', { title: 'test' })
    let remaining = store.getSubscriptionsForPlayer('PushSendTest1')
    assert.strictEqual(remaining.length, 1, 'The expired (410) subscription should be pruned')
    assert.strictEqual(remaining[0].endpoint, 'https://push.example.com/send-test-b', 'The still-good subscription should survive')

    // Test 3: a transient error (not 404/410) is logged, not pruned
    webpush.sendNotification = async function () {
        let err = new Error('service unavailable')
        err.statusCode = 503
        throw err
    }

    await push.sendTurnNotification('PushSendTest1', { title: 'test' })
    remaining = store.getSubscriptionsForPlayer('PushSendTest1')
    assert.strictEqual(remaining.length, 1, 'A transient send error should not prune the subscription')

    // Test 4: a player with no subscriptions is a silent no-op
    webpush.sendNotification = async function () {
        throw new Error('should never be called')
    }
    await push.sendTurnNotification('NoSuchPushPlayer', { title: 'test' })

    db.exec(`DELETE FROM push_subscriptions WHERE player_id LIKE 'PushSendTest%'`)
    console.log('✓ All unit tests passed successfully!')
}

run().catch(function (err) {
    console.error(err)
    process.exitCode = 1
})
