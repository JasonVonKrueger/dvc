// Server-Sent Events (SSE) manager for Da Vinci's Challenge
let eventSource = null

function connectGameStream(gameID) {
    if (eventSource) {
        eventSource.close()
    }

    eventSource = new EventSource(`/game/${gameID}/events`)

    eventSource.onopen = function (e) {
        console.log('DVC SSE stream connected for game:', gameID)
    }

    eventSource.onerror = function (error) {
        console.log('DVC SSE stream connection status/reconnecting:', error)
    }

    function processEventData(message) {
        if (!message || message.gameID !== GAME.id) return

        switch (message.event) {
            case 'GAME_STARTED':
                initBoard()
                showToast('You are ' + (GAME.myPlayerName || 'player ' + GAME.myPlayerNumber))
                savePlayerName(GAME.myPlayerName)
                break
            case 'MOVE_STARTED':
                GAME.moveStarted = true
                GAME.currentPlayer = message.currentPlayer
                break
            case 'MOVE_COMPLETE':
                updateBoard(message.currentPlayer, message.slotID, message.availableSlots)
                highlightScoredPatterns()
                if (GAME.currentPlayer == GAME.myPlayerNumber) {
                    setTimeout(function () {
                        $('#fol-container').classList.remove('fol-zoom-in') 
                        $('#fol-container').classList.add('fol-zoom-out') 
                    }, 300)
                }
                GAME.moveStarted = false
                break
            case 'SWITCH_PLAYER':
                GAME.currentPlayer = message.currentPlayer
                updatePlayerLocks()

                // is player 2 a bot? (solo mode only)
                if (message.currentPlayer == 2 && GAME.type === '(solo)') {
                    postData('/do', { event: 'GO_BOT', gameID: GAME.id })
                }
                break
            case 'STAGE_BOT':
                // simulate click event to stage bot
                let botPiece = document.getElementById(message.gamePiece)
                if (!botPiece) {
                    const cupSelector = message.gamePiece && message.gamePiece.includes('Oval') ? '#p2-oval-cup' : '#p2-triangle-cup'
                    botPiece = document.querySelector(`${cupSelector} .game-piece`)
                }

                if (botPiece) {
                    triggerEvent(botPiece, 'click')
                }

                // pause for effect and send the move
                setTimeout(function () {
                    if (botPiece) {
                        botPiece.remove()
                    }
                    postData('/do', { event: 'MOVE_COMPLETE', gameID: GAME.id, currentPlayer: 2, slotID: message.slotID })
                }, 3000)
                break
            case 'PLAYER_JOINED':
                showToast((message.playerName || 'Player 2') + ' joined the game!')
                break
            case 'SCORE':
                score(message.currentPlayer, message.playerOneScore, message.playerTwoScore, message.symbol, message.slots)
                break
        }
    }

    const knownEvents = ['GAME_STARTED', 'MOVE_STARTED', 'MOVE_COMPLETE', 'SWITCH_PLAYER', 'STAGE_BOT', 'SCORE', 'PLAYER_JOINED']
    knownEvents.forEach(function (eventType) {
        eventSource.addEventListener(eventType, function (e) {
            try {
                let data = JSON.parse(e.data)
                processEventData(data)
            } catch (err) {
                console.error('Error parsing SSE event data:', err)
            }
        })
    })

    eventSource.onmessage = function (e) {
        try {
            let data = JSON.parse(e.data)
            processEventData(data)
        } catch (err) {
            // Heartbeat or non-json message
        }
    }
}
