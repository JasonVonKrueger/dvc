/* ************************************************************************************
    @desc - persistence for game / player state

    Every export is fail-safe: if a write throws, the error is logged and the caller
    continues. Gameplay is still driven by the in-memory Game objects, so a database
    problem must never interrupt a match in progress.
************************************************************************************ */
const { db } = require('./db')

const statements = {
    insertGame: db.prepare(`
        INSERT INTO games (id, type, status, current_player)
        VALUES (@id, @type, @status, @currentPlayer)
        ON CONFLICT (id) DO NOTHING
    `),
    updateGame: db.prepare(`
        UPDATE games
           SET status = @status,
               current_player = @currentPlayer,
               updated_at = datetime('now')
         WHERE id = @id
    `),
    completeGame: db.prepare(`
        UPDATE games
           SET status = 'complete',
               winner = @winner,
               completed_at = datetime('now'),
               updated_at = datetime('now')
         WHERE id = @id
    `),
    upsertPlayer: db.prepare(`
        INSERT INTO players (id, is_bot)
        VALUES (@id, @isBot)
        ON CONFLICT (id) DO UPDATE SET
               is_bot = excluded.is_bot,
               last_seen = datetime('now')
    `),
    upsertGamePlayer: db.prepare(`
        INSERT INTO game_players (game_id, player_number, player_id, joined, is_bot, score, remaining_ovals, remaining_triangles)
        VALUES (@gameID, @playerNumber, @id, @joined, @isBot, @score, @remainingOvals, @remainingTriangles)
        ON CONFLICT (game_id, player_number) DO UPDATE SET
               player_id = excluded.player_id,
               joined = excluded.joined,
               is_bot = excluded.is_bot,
               score = excluded.score,
               remaining_ovals = excluded.remaining_ovals,
               remaining_triangles = excluded.remaining_triangles,
               updated_at = datetime('now')
    `),
    nextMoveNumber: db.prepare(`
        SELECT COALESCE(MAX(move_number), 0) + 1 AS next FROM moves WHERE game_id = ?
    `),
    insertMove: db.prepare(`
        INSERT INTO moves (game_id, move_number, player_number, slot_id)
        VALUES (@gameID, @moveNumber, @playerNumber, @slotID)
    `),
    insertScore: db.prepare(`
        INSERT INTO scores (game_id, move_id, player_number, symbol, points, slot_id)
        VALUES (@gameID, @moveID, @playerNumber, @symbol, @points, @slotID)
    `),
    selectGame: db.prepare(`SELECT * FROM games WHERE id = ?`),
    selectPlayers: db.prepare(`SELECT * FROM game_players WHERE game_id = ? ORDER BY player_number`),
    selectMoves: db.prepare(`SELECT * FROM moves WHERE game_id = ? ORDER BY move_number`),
    selectScores: db.prepare(`SELECT * FROM scores WHERE game_id = ? ORDER BY id`),
    selectGames: db.prepare(`SELECT * FROM games ORDER BY created_at DESC LIMIT ?`)
}

function safely(label, fn, fallback) {
    try {
        return fn()
    }
    catch (err) {
        console.error(`DB ERROR <<< ${label}: ${err.message}`)
        return fallback
    }
}

function toBit(value) {
    return value ? 1 : 0
}

function playerRow(gameID, playerNumber, player) {
    return {
        id: player.name,
        gameID: gameID,
        playerNumber: playerNumber,
        joined: toBit(player.joined),
        isBot: toBit(player.isBot),
        score: player.score || 0,
        remainingOvals: player.remainingOvals,
        remainingTriangles: player.remainingTriangles
    }
}

function savePlayers(game) {
    [[1, game.playerOne], [2, game.playerTwo]].forEach(function ([playerNumber, player]) {
        let row = playerRow(game.id, playerNumber, player)
        statements.upsertPlayer.run({ id: row.id, isBot: row.isBot })
        statements.upsertGamePlayer.run(row)
    })
}

// ****************************************************************
// record a brand new game and both of its player slots
const persistNewGame = db.transaction(function (game) {
    statements.insertGame.run({
        id: game.id,
        type: game.type,
        status: game.status || 'new',
        currentPlayer: game.currentPlayer
    })
    savePlayers(game)
})

function saveGame(game) {
    return safely('saveGame', function () {
        persistNewGame(game)
        return true
    }, false)
}

// ****************************************************************
// sync the mutable game + player fields back to the database
const persistGameState = db.transaction(function (game) {
    statements.updateGame.run({
        id: game.id,
        status: game.status || '',
        currentPlayer: game.currentPlayer
    })
    savePlayers(game)
})

function updateGameState(game) {
    return safely('updateGameState', function () {
        persistGameState(game)
        return true
    }, false)
}

// ****************************************************************
// record a placement and any patterns it completed
const persistMove = db.transaction(function (game, playerNumber, slotID, matches) {
    let moveNumber = statements.nextMoveNumber.get(game.id).next

    let result = statements.insertMove.run({
        gameID: game.id,
        moveNumber: moveNumber,
        playerNumber: playerNumber,
        slotID: slotID
    })

    let moveID = result.lastInsertRowid

    matches.forEach(function (match) {
        statements.insertScore.run({
            gameID: game.id,
            moveID: moveID,
            playerNumber: playerNumber,
            symbol: match.symbol,
            points: match.points,
            slotID: slotID
        })
    })

    statements.updateGame.run({
        id: game.id,
        status: game.status || '',
        currentPlayer: game.currentPlayer
    })
    savePlayers(game)

    return moveID
})

function recordMove(game, playerNumber, slotID, matches) {
    return safely('recordMove', function () {
        return persistMove(game, playerNumber, slotID, matches || [])
    }, null)
}

// ****************************************************************
// mark a game finished
function completeGame(gameID, winner) {
    return safely('completeGame', function () {
        statements.completeGame.run({ id: gameID, winner: winner || null })
        return true
    }, false)
}

// ****************************************************************
// read the full stored history of a game
function getGame(gameID) {
    return safely('getGame', function () {
        let game = statements.selectGame.get(gameID)

        if (!game) return null

        return {
            game: game,
            players: statements.selectPlayers.all(gameID),
            moves: statements.selectMoves.all(gameID),
            scores: statements.selectScores.all(gameID)
        }
    }, null)
}

function listGames(limit) {
    return safely('listGames', function () {
        return statements.selectGames.all(limit || 50)
    }, [])
}

module.exports = {
    saveGame,
    updateGameState,
    recordMove,
    completeGame,
    getGame,
    listGames
}
