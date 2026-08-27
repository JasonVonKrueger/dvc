const assert = require('assert')
const http = require('http')
const express = require('express')
const Game = require('../../lib/game')
const store = require('../../lib/store')
const { setupTestDb } = require('../helpers/db-helper')

console.log('Running integration test for SSE Reconnection & Last-Event-ID Catch-up...')

setupTestDb()

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

const server = app.listen(9878, () => {
    // 1. Create Game
    const game = new Game('(solo)', 'ReconnectTester')
    store.saveGame(game)
    const gameID = game.id

    // 2. Publish 2 events to DB prior to connection
    const id1 = publishGameEvent(gameID, 'GAME_STARTED', { gameID: gameID })
    const id2 = publishGameEvent(gameID, 'MOVE_COMPLETE', { gameID: gameID, slotID: 'oval1293' })

    // 3. Connect client with Last-Event-ID header set to id1
    const req = http.request({
        hostname: 'localhost',
        port: 9878,
        path: `/game/${gameID}/events`,
        method: 'GET',
        headers: {
            'Accept': 'text/event-stream',
            'Last-Event-ID': id1
        }
    }, (res) => {
        assert.strictEqual(res.statusCode, 200)

        let receivedData = ''
        res.on('data', (chunk) => {
            receivedData += chunk.toString()
            if (receivedData.includes('MOVE_COMPLETE')) {
                assert.ok(!receivedData.includes('GAME_STARTED'), 'Should skip event 1 since Last-Event-ID was set to id1')
                assert.ok(receivedData.includes('oval1293'), 'Should receive replayed missed event 2')
                console.log('✓ SSE Reconnection & Last-Event-ID catch-up test passed successfully!')
                req.destroy()
                server.close(() => process.exit(0))
            }
        })
    })

    req.end()
})
