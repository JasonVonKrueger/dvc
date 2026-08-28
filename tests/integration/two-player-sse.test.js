const assert = require('assert')
const http = require('http')
const express = require('express')
const Game = require('../../lib/game')
const store = require('../../lib/store')
const { setupTestDb } = require('../helpers/db-helper')

console.log('Running integration test for 2-Player (Play a Friend) flow over SSE...')

setupTestDb()

const PORT = 9879
const app = express()
app.use(express.json())

const GAMES = []
const sseSubscribers = new Map()

function getGameIndex(gameID) {
    return GAMES.find(g => g.id === gameID) || false
}

function publishGameEvent(gameID, eventType, payload) {
    let payloadObj = Object.assign({ type: 'BROADCAST', event: eventType, gameID: gameID }, payload)
    let eventID = store.recordEvent(gameID, eventType, payloadObj)
    payloadObj.eventId = eventID

    let clients = sseSubscribers.get(gameID)
    if (clients) {
        let sseMessage = `id: ${eventID}\nevent: ${eventType}\ndata: ${JSON.stringify(payloadObj)}\n\n`
        clients.forEach(client => client.write(sseMessage))
    }
    return eventID
}

// SSE endpoint
app.get('/game/:gameID/events', function (req, res) {
    const { gameID } = req.params
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    })
    res.flushHeaders() // Node buffers headers until first write; SSE clients need them immediately

    if (!sseSubscribers.has(gameID)) {
        sseSubscribers.set(gameID, new Set())
    }
    sseSubscribers.get(gameID).add(res)
})

// mirrors app.js joinGame(): marks a friend match ready once both players join
app.get('/join/:gameID/:playerNumber', function (req, res) {
    const currentGame = getGameIndex(req.params.gameID)
    const playerNumber = Number(req.params.playerNumber)

    if (!currentGame) {
        return res.send({ errMsg: 'Game not found!' })
    }

    if (playerNumber === 1) currentGame.playerOne.joined = true
    if (playerNumber === 2) currentGame.playerTwo.joined = true

    if (currentGame.type === '(friend)' && currentGame.playerOne.joined && currentGame.playerTwo.joined) {
        currentGame.status = 'ready'
    }

    store.updateGameState(currentGame)

    const playerName = playerNumber === 2 ? currentGame.playerTwo.name : currentGame.playerOne.name

    if (playerNumber === 2) {
        publishGameEvent(currentGame.id, 'PLAYER_JOINED', { playerNumber: 2, playerName: playerName })
    }

    res.send({ gameStatus: currentGame.status, gameID: currentGame.id, playerName: playerName })
})

// Command endpoint
app.post('/do', function (req, res) {
    const { event, gameID, slotID, currentPlayer } = req.body
    const currentGame = getGameIndex(gameID)

    if (event === 'START_GAME') {
        publishGameEvent(gameID, 'GAME_STARTED', { gameType: '(friend)', gameID: gameID })
    } else if (event === 'MOVE_COMPLETE') {
        publishGameEvent(gameID, 'MOVE_COMPLETE', { gameID: gameID, slotID: slotID, currentPlayer: currentPlayer, availableSlots: [] })
    } else if (event === 'SWITCH_PLAYER') {
        currentGame.currentPlayer = currentPlayer === 1 ? 2 : 1
        publishGameEvent(gameID, 'SWITCH_PLAYER', { gameID: gameID, currentPlayer: currentGame.currentPlayer })
    }

    res.send({ message: 'ok' })
})

function connectSSE(gameID, onData) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: PORT,
            path: `/game/${gameID}/events`,
            method: 'GET',
            headers: { 'Accept': 'text/event-stream' }
        }, (res) => {
            assert.strictEqual(res.statusCode, 200, 'SSE endpoint should return 200')
            res.on('data', (chunk) => onData(chunk.toString()))
            resolve(req)
        })
        req.on('error', reject)
        req.end()
    })
}

function getJSON(path) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${PORT}${path}`, (res) => {
            let body = ''
            res.on('data', c => body += c)
            res.on('end', () => resolve(JSON.parse(body)))
        }).on('error', reject)
    })
}

function post(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body)
        const req = http.request({
            hostname: 'localhost',
            port: PORT,
            path: path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, (res) => {
            let out = ''
            res.on('data', c => out += c)
            res.on('end', () => resolve(out))
        })
        req.on('error', reject)
        req.write(data)
        req.end()
    })
}

const server = app.listen(PORT, async () => {
  try {
    const game = new Game('(friend)', 'Leonardo')
    store.saveGame(game)
    GAMES.push(game)
    const gameID = game.id

    let p1Events = ''
    let p2Events = ''

    const p1Req = await connectSSE(gameID, (chunk) => { p1Events += chunk })
    console.log('DEBUG: p1 SSE connected')
    const p2Req = await connectSSE(gameID, (chunk) => { p2Events += chunk })
    console.log('DEBUG: p2 SSE connected')

    // 1. Host and guest both join
    const joinOne = await getJSON(`/join/${gameID}/1`)
    console.log('DEBUG: joinOne', joinOne)
    assert.strictEqual(joinOne.gameStatus, '', 'Game should not be ready with only one player joined')

    const joinTwo = await getJSON(`/join/${gameID}/2`)
    console.log('DEBUG: joinTwo', joinTwo)
    assert.strictEqual(joinTwo.gameStatus, 'ready', 'Game should be ready once both players have joined')

    // 2. Player 2 joining should notify player 1 in real time
    assert.ok(p1Events.includes('PLAYER_JOINED'), 'Host should receive PLAYER_JOINED event')

    // 3. Start the game once ready, as the client would
    await post('/do', { event: 'START_GAME', gameID: gameID })
    assert.ok(p1Events.includes('GAME_STARTED'), 'Host should receive GAME_STARTED event')
    assert.ok(p2Events.includes('GAME_STARTED'), 'Guest should receive GAME_STARTED event')

    // 4. Player 1 places a piece, then turn switches to player 2
    await post('/do', { event: 'MOVE_COMPLETE', gameID: gameID, slotID: 'oval1293', currentPlayer: 1 })
    await post('/do', { event: 'SWITCH_PLAYER', gameID: gameID, currentPlayer: 1 })

    assert.ok(p1Events.includes('MOVE_COMPLETE') && p2Events.includes('MOVE_COMPLETE'), 'Both players should see the move')
    assert.ok(p1Events.includes('"currentPlayer":2') && p2Events.includes('"currentPlayer":2'), 'Both players should see the turn switch to player 2')

    // 5. Player 2 places a piece, then turn switches back to player 1
    await post('/do', { event: 'MOVE_COMPLETE', gameID: gameID, slotID: 'triangle120', currentPlayer: 2 })
    await post('/do', { event: 'SWITCH_PLAYER', gameID: gameID, currentPlayer: 2 })

    const finalState = await getJSON(`/game/${gameID}/state`)
    assert.strictEqual(finalState.gameID, gameID, 'State gameID should match')

    console.log('✓ 2-Player SSE integration test passed successfully!')
    p1Req.destroy()
    p2Req.destroy()
    server.close(() => process.exit(0))
  } catch (err) {
    console.error('✗ 2-Player SSE integration test failed:', err)
    server.close(() => process.exit(1))
  }
})
