const { db } = require('../../lib/db')
const store = require('../../lib/store')

function setupTestDb() {
    // Clear relevant tables before test
    db.exec(`
        DELETE FROM game_events;
        DELETE FROM scores;
        DELETE FROM moves;
        DELETE FROM game_players;
        DELETE FROM games;
    `)
}

module.exports = {
    setupTestDb,
    db,
    store
}
