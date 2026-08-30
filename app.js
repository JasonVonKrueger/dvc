/* ************************************************************************************
    @desc - single server process that serves pages and handles SSE connections
************************************************************************************ */
const GAMES = []
const GAME_ID_LENGTH = 5
const config = require('./conf/server')
const Game = require('./lib/game')
const store = require('./lib/store')
const express = require('express')
const path = require('path')
const app = express()
app.set('trust proxy', 1) // needed for correct req.ip when running behind Nginx
app.use('/', express.static(path.join(__dirname, 'public')))
app.use(express.json())

// Lightweight per-IP rate limiter to blunt brute-force game-code guessing and
// unauthenticated create/join spam. Single-process/in-memory - fine since this
// app runs as one pm2 process, not a fleet.
const rateLimitBuckets = new Map()
setInterval(function () {
    const cutoff = Date.now() - 5 * 60 * 1000
    rateLimitBuckets.forEach(function (bucket, key) {
        if (bucket.start < cutoff) rateLimitBuckets.delete(key)
    })
}, 5 * 60 * 1000).unref()

function rateLimit(max, windowMs) {
    return function (req, res, next) {
        const key = req.ip
        const now = Date.now()
        let bucket = rateLimitBuckets.get(key)
        if (!bucket || now - bucket.start > windowMs) {
            bucket = { start: now, count: 0 }
            rateLimitBuckets.set(key, bucket)
        }
        bucket.count++
        if (bucket.count > max) {
            return res.status(429).send({ errMsg: 'Too many requests, please slow down.' })
        }
        next()
    }
}

// Active SSE subscribers by gameID -> Set<Response>
const sseSubscribers = new Map()

// ****************************************************************
// SSE subscription endpoint per game
app.get('/game/:gameID/events', function(req, res) {
    const { gameID } = req.params
    const lastEventId = parseInt(req.headers['last-event-id'] || req.query.lastEventId || '0', 10)

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    })

    if (!sseSubscribers.has(gameID)) {
        sseSubscribers.set(gameID, new Set())
    }
    sseSubscribers.get(gameID).add(res)

    // Replay missed events if client reconnected with Last-Event-ID or lastEventId query param
    if (lastEventId > 0) {
        const missedEvents = store.getEventsSince(gameID, lastEventId)
        missedEvents.forEach(evt => {
            res.write(`id: ${evt.id}\nevent: ${evt.event_type}\ndata: ${evt.payload_json}\n\n`)
        })
    }

    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n')
    }, 15000)

    req.on('close', function() {
        clearInterval(heartbeat)
        const set = sseSubscribers.get(gameID)
        if (set) {
            set.delete(res)
            if (set.size === 0) {
                sseSubscribers.delete(gameID)
            }
        }
    })
})

const server = app.listen(config.devserver.port || 9115, function() {
    console.log(`DVC app listening on port ${config.devserver.port}`)
})

app.get('/create/:gameType', rateLimit(20, 60000), function(req, res) {
    let game = createGame(req.params.gameType, req.query.playerName)
    res.send(game)
})

app.get('/join/:gameID/:playerNumber', rateLimit(30, 60000), function(req, res) {
    let game = joinGame(req.params.gameID, req.params.playerNumber)
    res.send(game)
})

// Debug/admin endpoints leak every game ID ever created, which defeats the
// "only people with the code can join" model - require a shared admin token.
// Unset ADMIN_TOKEN disables these routes entirely (fail closed).
function requireAdmin(req, res, next) {
    const token = process.env.ADMIN_TOKEN
    if (!token || req.get('x-admin-token') !== token) {
        return res.status(404).end()
    }
    next()
}

app.get('/listgames', requireAdmin, function(req, res) {
    res.send(GAMES)
})

app.get('/history/games', requireAdmin, function(req, res) {
    res.send(store.listGames(Number(req.query.limit) || 50))
})

app.get('/history/games/:gameID', requireAdmin, function(req, res) {
    let record = store.getGame(req.params.gameID)

    if (!record) {
        return res.status(404).send({ errMsg: 'Game not found!' })
    }

    res.send(record)
})

app.get('/game/:gameID/state', function(req, res) {
    let currentGame = getGameIndex(req.params.gameID)

    if (!currentGame) {
        return res.status(404).send({ errMsg: 'Game not found!' })
    }

    res.send({
        gameID: currentGame.id,
        type: currentGame.type,
        status: currentGame.status,
        currentPlayer: currentGame.currentPlayer,
        playerOne: currentGame.playerOne,
        playerTwo: currentGame.playerTwo,
        availableSlots: currentGame.availableSlots
    })
})

app.post('/do', function(req, res) {
    let answer = null

    switch (req.body.event) {
        case 'START_GAME':
            answer = startGame(req.body.gameID)
            res.send(answer)
            break
        case 'MOVE_STARTED':
            answer = startMove(req.body.gameID, req.body.currentPlayer)
            res.send(answer)
            break
        case 'MOVE_COMPLETE':
            answer = completeMove(req.body.gameID, req.body.slotID, req.body.currentPlayer)
            res.send(answer)
            break   
        case 'SWITCH_PLAYER':
            answer = switchPlayer(req.body.gameID, req.body.currentPlayer)
            res.send(answer)
            break   
        case 'GO_BOT':
            let currentGame = getGameIndex(req.body.gameID)
            if (currentGame) {
                broadcast(currentGame.botSelectPiece())
                res.send({ message: 'ok' })
            }
            break 
    }

    console.log('INCOMING <<< ' + req.body.event)
})

/* ************************************************************************************
   game functions
************************************************************************************ */

function createGame(gameType, playerOneName) {
    let game =  new Game(gameType, playerOneName)

    if (game.id) {
        GAMES.push(game)
        store.saveGame(game)
        return { gameID: game.id, playerName: game.playerOne.name }
    }
}

function joinGame(gameID, playerNumber) {
    let currentGame = getGameIndex(gameID)

    if (currentGame) {
        if (playerNumber == 1) {
            currentGame.playerOne.joined = true
        }

        if (playerNumber == 2) {
            currentGame.playerTwo.joined = true

            if (currentGame.type === '(solo)') {
                currentGame.playerTwo.isBot = true
                currentGame.status = 'ready'
            }
        }

        // a friend match is ready once both human players have joined
        if (currentGame.type === '(friend)' && currentGame.playerOne.joined && currentGame.playerTwo.joined) {
            currentGame.status = 'ready'
        }

        store.updateGameState(currentGame)

        let playerName = (playerNumber == 2) ? currentGame.playerTwo.name : currentGame.playerOne.name

        if (playerNumber == 2) {
            publishGameEvent(gameID, 'PLAYER_JOINED', { playerNumber: 2, playerName: playerName })
        }

        return JSON.stringify({ gameStatus: currentGame.status, gameID: gameID, playerName: playerName })
    }
    else {
        return JSON.stringify({ errMsg: 'Game not found!' })
    }
}


// ****************************************************************
// start game
function startGame(gameID) {
    let currentGame = getGameIndex(gameID)

    if (currentGame) {
        store.updateGameState(currentGame)

        broadcast(JSON.stringify({ type: 'BROADCAST', 
                                event: 'GAME_STARTED', 
                                gameType: currentGame.type,
                                gameID: currentGame.id }));

        return { message: 'ok' }
    }
    else {
        return { message: 'Game not found' }
    }
}

 // ****************************************************************
 // start player move
function startMove(gameID, currentPlayer) {
    let currentGame = getGameIndex(gameID)

    if (currentGame) {
        currentGame.currentPlayer = currentPlayer
        currentGame.moveStarted = true
        store.updateGameState(currentGame)

        broadcast(JSON.stringify({ type: 'BROADCAST', 
                                event: 'MOVE_STARTED', 
                                gameType: currentGame.type,
                                currentPlayer: currentPlayer,
                                gameID: currentGame.id }));

        return { message: 'ok' }
    }
    else {
        return { message: 'Game not found' }
    }
}

 // ****************************************************************
 // complete the move
 function completeMove(gameID, slotID, currentPlayer) {
    let currentGame = getGameIndex(gameID)

    if (!currentGame) {
        return { message: 'Game not found' }
    }

    // remove the slot from available slots
    currentGame.availableSlots = currentGame.removeSlot(slotID)

    let playerSlots = null

    if (currentGame.currentPlayer == 1) {
        currentGame.playerOne.slots.push(slotID)
        playerSlots = currentGame.playerOne.slots
    }

    if (currentGame.currentPlayer == 2) {
        currentGame.playerTwo.slots.push(slotID)
        playerSlots = currentGame.playerTwo.slots
    }

    // checkForScoringPattern now takes the slot that was JUST placed as a
    // second argument, and returns an ARRAY of matches (a single placement
    // can complete more than one symbol at once).
    let matches = currentGame.checkForScoringPattern(playerSlots, slotID)

    matches.forEach(function (symbol_formed) {
        if (currentGame.currentPlayer == 1) {
            currentGame.playerOne.score += symbol_formed.points
        }

        if (currentGame.currentPlayer == 2) {
            currentGame.playerTwo.score += symbol_formed.points
        }

        console.log('************* SCORED: ' + symbol_formed.symbol)


        broadcast(JSON.stringify({ type: 'BROADCAST',
                                    event: 'SCORE',
                                    gameID: gameID,
                                    currentPlayer: currentGame.currentPlayer,
                                    symbol: symbol_formed.symbol,
                                    points: symbol_formed.points,
                                    slots: symbol_formed.slots,
                                    playerOneScore: currentGame.playerOne.score,
                                    playerTwoScore: currentGame.playerTwo.score  }));
    })

    store.recordMove(currentGame, currentGame.currentPlayer, slotID, matches)

    broadcast(JSON.stringify({ type: 'BROADCAST', 
                            event: 'MOVE_COMPLETE',                                     
                            gameID: gameID, 
                            slotID: slotID,
                            availableSlots: currentGame.availableSlots,
                            currentPlayer:  currentGame.currentPlayer }));

    return { message: 'ok' }
}

 // ****************************************************************
 // switch players
 function switchPlayer(gameID, currentPlayer) {
    let currentGame = getGameIndex(gameID)

    if (currentGame) {
        currentGame.currentPlayer = (currentPlayer === 1) ? 2 : 1
        store.updateGameState(currentGame)

        broadcast(JSON.stringify({ type: 'BROADCAST', 
                                event: 'SWITCH_PLAYER', 
                                gameID: currentGame.id,
                                currentPlayer: currentGame.currentPlayer }));

        return { message: 'ok' }
    }
    else {
        return { message: 'Game not found' }
    }
}

 // ****************************************************************
 // send messages to subscribers of a game via SSE
 function publishGameEvent(gameID, eventType, payload) {
    let payloadObj = Object.assign({ type: 'BROADCAST', event: eventType, gameID: gameID }, payload)
    let eventID = store.recordEvent(gameID, eventType, payloadObj)
    payloadObj.eventId = eventID

    let clients = sseSubscribers.get(gameID)
    if (clients) {
        let sseMessage = `id: ${eventID}\nevent: ${eventType}\ndata: ${JSON.stringify(payloadObj)}\n\n`
        clients.forEach(function(client) {
            client.write(sseMessage)
        })
    }
    return eventID
}

// Legacy helper compatibility wrapper
function broadcast(message) {
    try {
        let obj = typeof message === 'string' ? JSON.parse(message) : message
        if (obj && obj.gameID && obj.event) {
            publishGameEvent(obj.gameID, obj.event, obj)
        }
    } catch (e) {
        console.error('Broadcast parse error:', e.message)
    }
}

// ****************************************************************
// get active game index (or load from store if not in memory)
function getGameIndex(gameID) {
    if (GAMES) {
        for (let i = 0; i < GAMES.length; i++) {
            if (GAMES[i].id === gameID) {
                return GAMES[i]
            }      
        }
    }
    
    let loadedGame = store.loadGameFromDB(gameID)
    if (loadedGame) {
        GAMES.push(loadedGame)
        return loadedGame
    }

    return false
}