/* ************************************************************************************
    @desc - sqlite connection + schema bootstrap

    The database is a side-car to the in-memory GAMES array: the running game is
    still driven entirely from memory, this just records what happened so state can
    be inspected, reported on, or restored later.
************************************************************************************ */
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const config = require('../conf/server')

const DB_DIR = path.resolve(__dirname, '..', config.database.directory)
const DB_FILE = path.join(DB_DIR, config.database.filename)

fs.mkdirSync(DB_DIR, { recursive: true })

const db = new Database(DB_FILE)

// WAL keeps reads from blocking the websocket/HTTP writes
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
    id            TEXT PRIMARY KEY,
    type          TEXT,
    status        TEXT,
    current_player INTEGER DEFAULT 1,
    winner        INTEGER,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS moves (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT NOT NULL,
    move_number   INTEGER NOT NULL,
    player_number INTEGER NOT NULL,
    slot_id       TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scores (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT NOT NULL,
    move_id       INTEGER,
    player_number INTEGER NOT NULL,
    symbol        TEXT NOT NULL,
    points        INTEGER NOT NULL,
    slot_id       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    FOREIGN KEY (move_id) REFERENCES moves (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_moves_game ON moves (game_id, move_number);
CREATE INDEX IF NOT EXISTS idx_scores_game ON scores (game_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games (status);
`

// players.id is the generated display name -- one row per persistent player
// identity, reused across every game that player takes part in
const PLAYERS_TABLE = `
CREATE TABLE IF NOT EXISTS players (
    id          TEXT PRIMARY KEY,
    is_bot      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen   TEXT NOT NULL DEFAULT (datetime('now'))
)
`

// per-game state for a player identity
const GAME_PLAYERS_TABLE = `
CREATE TABLE IF NOT EXISTS game_players (
    game_id             TEXT NOT NULL,
    player_number       INTEGER NOT NULL,
    player_id           TEXT NOT NULL,
    joined              INTEGER NOT NULL DEFAULT 0,
    is_bot              INTEGER NOT NULL DEFAULT 0,
    score               INTEGER NOT NULL DEFAULT 0,
    remaining_ovals     INTEGER NOT NULL DEFAULT 45,
    remaining_triangles INTEGER NOT NULL DEFAULT 27,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (game_id, player_number),
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
)
`

// incremental event log for Server-Sent Events (SSE) stream & catch-up
const GAME_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS game_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT NOT NULL,
    event_type    TEXT NOT NULL,
    payload_json  TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
)
`

// earlier versions kept per-game state on the players table itself, which stopped
// working once a name could be reused across games -- split it into two tables
function migratePlayersTable() {
    let columns = db.prepare(`SELECT name, type FROM pragma_table_info('players')`).all()

    if (!columns.length || !columns.some((column) => column.name === 'game_id')) return

    let idIsInteger = columns.some((column) => column.name === 'id' && column.type.toUpperCase() === 'INTEGER')
    let nameExpression = idIsInteger ? `'player-' || id` : 'id'

    db.pragma('foreign_keys = OFF')

    db.exec(`
        BEGIN;
        ALTER TABLE players RENAME TO players_old;
        ${PLAYERS_TABLE};
        ${GAME_PLAYERS_TABLE};
        INSERT OR IGNORE INTO players (id, is_bot, created_at, last_seen)
             SELECT ${nameExpression}, MAX(is_bot), MIN(created_at), MAX(updated_at)
               FROM players_old
              GROUP BY ${nameExpression};
        INSERT OR IGNORE INTO game_players (game_id, player_number, player_id, joined, is_bot, score, remaining_ovals, remaining_triangles, created_at, updated_at)
             SELECT game_id, player_number, ${nameExpression}, joined, is_bot, score, remaining_ovals, remaining_triangles, created_at, updated_at
               FROM players_old;
        DROP TABLE players_old;
        COMMIT;
    `)

    db.pragma('foreign_keys = ON')
}

migratePlayersTable()

db.exec(SCHEMA)
db.exec(PLAYERS_TABLE)
db.exec(GAME_PLAYERS_TABLE)
db.exec(GAME_EVENTS_TABLE)
db.exec('CREATE INDEX IF NOT EXISTS idx_game_players_player ON game_players (player_id)')
db.exec('CREATE INDEX IF NOT EXISTS idx_game_events ON game_events (game_id, id)')

process.on('exit', function () {
    try { db.close() } catch (err) { /* already closed */ }
})

module.exports = { db, DB_FILE }
