const assert = require('assert')
const http = require('http')
const express = require('express')
const Game = require('../../lib/game')
const store = require('../../lib/store')
const { setupTestDb } = require('../helpers/db-helper')

console.log('Running standalone integration test for SSE endpoint...')

setupTestDb()

// Set up express app with SSE route and publish helper for testing
const app = express()
app.use(express.json())

const sseSubscribers = new Map()

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

    if (lastEventId > 0) {
        const missedEvents = store.getEventsSince(gameID, lastEventId)
        missedEvents.forEach(evt => {
            res.write(`id: ${evt.id}\nevent: ${evt.event_type}\ndata: ${evt.payload_json}\n\n`)
        })
    }
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

const server = app.listen(9876, () => {
    // Create test game
    const game = new Game('(solo)', 'IntegrationPlayer')
    store.saveGame(game)
    const gameID = game.id

    // Test GET /game/:gameID/events SSE endpoint
    const options = {
        hostname: 'localhost',
        port: 9876,
        path: `/game/${gameID}/events`,
        method: 'GET',
        headers: {
            'Accept': 'text/event-stream'
        }
    }

    const req = http.request(options, (res) => {
        assert.strictEqual(res.statusCode, 200, 'SSE endpoint should return 200')
        assert.strictEqual(res.headers['content-type'], 'text/event-stream', 'Content type should be text/event-stream')

        let dataReceived = ''
        res.on('data', (chunk) => {
            dataReceived += chunk.toString()
            if (dataReceived.includes('GAME_STARTED')) {
                assert.ok(dataReceived.includes('event: GAME_STARTED'), 'SSE response should contain published event type')
                assert.ok(dataReceived.includes(gameID), 'SSE payload should contain game ID')
                console.log('✓ SSE Integration test passed successfully!')
                req.destroy()
                server.close(() => process.exit(0))
            }
        })
    })

    req.end()

    setTimeout(() => {
        publishGameEvent(gameID, 'GAME_STARTED', { gameType: '(solo)', gameID: gameID })
    }, 200)
})
