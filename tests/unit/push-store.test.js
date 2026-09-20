const assert = require('assert')
const { setupTestDb, store, db } = require('../helpers/db-helper')

console.log('Running unit tests for push subscription storage...')

setupTestDb()

// push_subscriptions isn't a child of games, so it isn't touched by
// setupTestDb() -- clear this test's own rows for idempotent re-runs
db.exec(`DELETE FROM push_subscriptions WHERE player_id = 'PushTestPlayer'`)

const subscription = {
    endpoint: 'https://push.example.com/test-endpoint-1',
    keys: { p256dh: 'test-p256dh', auth: 'test-auth' }
}

// Test 1: saveSubscription stores a retrievable row, and creates the player
// identity row it depends on (FK) if it doesn't already exist
assert.strictEqual(store.saveSubscription('PushTestPlayer', subscription), true, 'saveSubscription should report success')

let stored = store.getSubscriptionsForPlayer('PushTestPlayer')
assert.strictEqual(stored.length, 1, 'Should have exactly one stored subscription')
assert.strictEqual(stored[0].endpoint, subscription.endpoint, 'Stored endpoint should match')
assert.strictEqual(stored[0].p256dh, 'test-p256dh', 'Stored p256dh key should match')

// Test 2: saving the same endpoint again upserts rather than duplicating
// (e.g. the browser re-subscribes with rotated keys)
store.saveSubscription('PushTestPlayer', {
    endpoint: subscription.endpoint,
    keys: { p256dh: 'rotated-p256dh', auth: 'rotated-auth' }
})

stored = store.getSubscriptionsForPlayer('PushTestPlayer')
assert.strictEqual(stored.length, 1, 'Re-subscribing on the same endpoint should not duplicate the row')
assert.strictEqual(stored[0].p256dh, 'rotated-p256dh', 'Upsert should refresh the stored keys')

// Test 3: a second, different endpoint for the same player is a second row
// (a player can be subscribed on more than one device)
store.saveSubscription('PushTestPlayer', {
    endpoint: 'https://push.example.com/test-endpoint-2',
    keys: { p256dh: 'device2-p256dh', auth: 'device2-auth' }
})

stored = store.getSubscriptionsForPlayer('PushTestPlayer')
assert.strictEqual(stored.length, 2, 'A second device should add a second subscription row')

// Test 4: removeSubscription deletes only the targeted endpoint
store.removeSubscription('https://push.example.com/test-endpoint-2')
stored = store.getSubscriptionsForPlayer('PushTestPlayer')
assert.strictEqual(stored.length, 1, 'removeSubscription should remove exactly one row')
assert.strictEqual(stored[0].endpoint, subscription.endpoint, 'Remaining subscription should be the untouched one')

// Test 5: a player with no subscriptions gets an empty array, not an error
assert.deepStrictEqual(store.getSubscriptionsForPlayer('NoSuchPlayer'), [], 'Unknown player should yield an empty array')

// cleanup
db.exec(`DELETE FROM push_subscriptions WHERE player_id = 'PushTestPlayer'`)

console.log('✓ All unit tests passed successfully!')
