const assert = require('assert')
const Game = require('../../lib/game')
const { setupTestDb, store } = require('../helpers/db-helper')

console.log('Running unit tests for store & SSE event recording...')

setupTestDb()

// First save a game so foreign key constraint passes
const game = new Game('(solo)', 'TestPlayer')
store.saveGame(game)
const gameID = game.id

// Test 1: recordEvent
const eventID1 = store.recordEvent(gameID, 'GAME_STARTED', { gameType: '(solo)', gameID: gameID })
assert.strictEqual(typeof eventID1, 'number', 'recordEvent should return a numeric ID')
assert.ok(eventID1 > 0, 'eventID should be positive')

// Test 2: record multiple events
const eventID2 = store.recordEvent(gameID, 'MOVE_COMPLETE', { gameID: gameID, slotID: 'oval1293', currentPlayer: 1 })
assert.ok(eventID2 > eventID1, 'Sequential event IDs should increase')

// Test 3: getEventsSince
const eventsAfterZero = store.getEventsSince(gameID, 0)
assert.strictEqual(eventsAfterZero.length, 2, 'Should retrieve 2 events since ID 0')

const eventsAfterOne = store.getEventsSince(gameID, eventID1)
assert.strictEqual(eventsAfterOne.length, 1, 'Should retrieve 1 event after eventID1')
assert.strictEqual(eventsAfterOne[0].event_type, 'MOVE_COMPLETE', 'Retrieved event type should match')

const payloadParsed = JSON.parse(eventsAfterOne[0].payload_json)
assert.strictEqual(payloadParsed.slotID, 'oval1293', 'Event payload should deserialize correctly')

console.log('✓ All unit tests passed successfully!')
