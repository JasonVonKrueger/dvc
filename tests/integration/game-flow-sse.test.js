const assert = require('assert')
const http = require('http')
const express = require('express')
const Game = require('../../lib/game')
const store = require('../../lib/store')
const { setupTestDb } = require('../helpers/db-helper')

console.log('Running integration test for full Game Flow over SSE...')

setupTestDb()

const app = express()
app.use(express.json())

const sseSubscribers = new Map()

// SSE endpoint
app.get('/game/:gameID/events', function(req, res) {
    const { gameID } = req.params
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
})

// State endpoint
app.get('/game/:gameID/state', function(req, res) {
    let currentGame = store.loadGameFromDB(req.params.gameID)
    if (!currentGame) return res.status(404).send({ errMsg: 'Game not found!' })
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

// Command endpoint
app.post('/do', function(req, res) {
    const { event, gameID, slotID, currentPlayer } = req.body
    if (event === 'START_GAME') {
        publishGameEvent(gameID, 'GAME_STARTED', { gameType: '(solo)', gameID: gameID })
    } else if (event === 'MOVE_COMPLETE') {
        publishGameEvent(gameID, 'MOVE_COMPLETE', { gameID: gameID, slotID: slotID, currentPlayer: currentPlayer, availableSlots: [] })
    }
    res.send({ message: 'ok' })
})

const server = app.listen(9877, () => {
    // 1. Create Game
    const game = new Game('(solo)', 'FlowTester')
    store.saveGame(game)
    const gameID = game.id

    const receivedEvents = []

    // 2. Connect SSE subscriber
    const sseReq = http.request({
        hostname: 'localhost',
        port: 9877,
        path: `/game/${gameID}/events`,
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' }
    }, (res) => {
        assert.strictEqual(res.statusCode, 200)

        res.on('data', (chunk) => {
            const str = chunk.toString()
            if (str.includes('GAME_STARTED')) receivedEvents.push('GAME_STARTED')
            if (str.includes('MOVE_COMPLETE')) receivedEvents.push('MOVE_COMPLETE')

            if (receivedEvents.includes('GAME_STARTED') && receivedEvents.includes('MOVE_COMPLETE')) {
                // 3. Verify state endpoint
                http.get(`http://localhost:9877/game/${gameID}/state`, (stateRes) => {
                    let stateBody = ''
                    stateRes.on('data', c => stateBody += c)
                    stateRes.on('end', () => {
                        const state = JSON.parse(stateBody)
                        assert.strictEqual(state.gameID, gameID, 'State gameID should match')
                        console.log('✓ Full Game Flow SSE integration test passed successfully!')
                        sseReq.destroy()
                        server.close(() => process.exit(0))
                    })
                })
            }
        })
    })

    sseReq.end()

    // 4. Trigger actions via HTTP POST /do
    setTimeout(() => {
        const postReq = http.request({
            hostname: 'localhost',
            port: 9877,
            path: '/do',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        postReq.write(JSON.stringify({ event: 'START_GAME', gameID: gameID }))
        postReq.end()
    }, 200)

    setTimeout(() => {
        const postReq = http.request({
            hostname: 'localhost',
            port: 9877,
            path: '/do',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        postReq.write(JSON.stringify({ event: 'MOVE_COMPLETE', gameID: gameID, slotID: 'oval1293', currentPlayer: 1 }))
        postReq.end()
    }, 400)
})
