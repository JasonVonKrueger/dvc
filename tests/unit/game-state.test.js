const assert = require('assert')
const Game = require('../../lib/game')
const { setupTestDb, store } = require('../helpers/db-helper')

console.log('Running unit tests for Game State & Rehydration...')

setupTestDb()

// Test 1: Create and save game state
const game = new Game('(solo)', 'StatePlayer1')
store.saveGame(game)
const gameID = game.id

assert.strictEqual(game.playerOne.name, 'StatePlayer1', 'Player 1 name should match')
assert.strictEqual(game.currentPlayer, 1, 'Initial current player should be 1')
assert.ok(game.availableSlots.length > 0, 'Available slots should be initialized')

// Test 2: Record move and update state
const slotToPlace = game.availableSlots[0]
game.availableSlots = game.removeSlot(slotToPlace)
game.playerOne.slots.push(slotToPlace)
game.playerOne.score += 5
store.recordMove(game, 1, slotToPlace, [{ symbol: 'test_symbol', points: 5, slots: [slotToPlace] }])

// Test 3: Load game from DB and verify rehydration
const loadedGame = store.loadGameFromDB(gameID)
assert.ok(loadedGame !== null, 'Loaded game should not be null')
assert.strictEqual(loadedGame.id, gameID, 'Loaded game ID should match')
assert.strictEqual(loadedGame.playerOne.score, 5, 'Player 1 score should match saved score')
assert.strictEqual(loadedGame.playerOne.slots.includes(slotToPlace), true, 'Player 1 slots should contain placed slot')
assert.ok(!loadedGame.availableSlots.includes(slotToPlace), 'Available slots should not contain placed slot')

console.log('✓ Game state unit tests passed successfully!')
