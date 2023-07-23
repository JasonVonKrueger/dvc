// Create WebSocket connection.
//const socket = new WebSocket('wss://sockets.davincischallenge.app')
const socket = new WebSocket('ws://localhost:9115/sockets')

socket.onopen = function(e) {
    console.log('DVC socket server online')
}

// listen for messages
socket.onmessage = function(e) {
    let message = JSON.parse(e.data)

    if (message.type == 'BROADCAST') {
        if (message.gameID === GAME.id) {
            switch (message.event) {
                case 'GAME_STARTED':
                    initBoard()
                    showToast('You are player ' + GAME.myPlayerNumber)
                    break
                case 'MOVE_STARTED':
                    GAME.moveStarted = true
                    GAME.currentPlayer = message.currentPlayer
                    break
                case 'MOVE_COMPLETE':
                    updateBoard(message.currentPlayer, message.slotID)
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

                    // is player 2 a bot?
                    if (message.currentPlayer == 2) {
                        postData('/do', { event: 'GO_BOT', gameID: GAME.id })
                    }

                    //GAME.toggleFlashers(message.currentPlayer)
                    break
                case 'STAGE_BOT':
                    // simulate click event to stage bot
                    triggerEvent(document.getElementById(message.gamePiece), 'click')

                    // pause for effect and send the move
                    setTimeout(function () {
                        postData('/do', { event: 'MOVE_COMPLETE', gameID: GAME.id, currentPlayer: 2, slotID: message.slotID })

                        document.getElementById(message.gamePiece).remove()
                    }, 3000)

                    break
            }
        }
    }



    if (message.type == 'BROADCASTXX') {
        console.log('RGP: ' + message.event)
        // messages between players of the same game
        if (message.gameID === GAME.id) {
            switch (message.event) {             
                case 'JOINED_GAME':
                    if (!GAME.myPlayerNumber) {
                        if (message.playerNumber == 2) {
                            GAME.myPlayerNumber.number = 2
                        }
                        else {
                            GAME.myPlayerNumber = 1
                        }
                    }

                    break
                case 'GAME_READY':
                        // time to play....
                        $('#txtWaiting').classList.add('hidden')
                        $('.modal').classList.add('hidden')
                        $('#waitingForPlayer').classList.add('hidden') 

                        GAME.currentPlayer = message.currentPlayer

                        // prevent player 1 from selecting player 2's pieces
                        if (GAME.myPlayerNumber == 1) {
                            $('#p2-oval-cup').classList.add('no-pointer-events')
                            $('#p2-triangle-cup').classList.add('no-pointer-events')                                           
                        }

                        // prevent player 2 from selecting player 1's pieces
                        if (GAME.myPlayerNumber == 2) {
                            $('#p1-oval-cup').classList.add('no-pointer-events')
                            $('#p1-triangle-cup').classList.add('no-pointer-events')                           
                        } 
                        
                        showToast('You are player ' + GAME.myPlayerNumber)
    
                        //GAME.toggleFlashers(1)

                        break   
                case 'SCORE':
                    score(message.currentPlayer, message.playerOneScore, message.playerTwoScore, message.symbol)
                    break
                case 'SWITCH_PLAYER':
                    GAME.switchPlayer(message.currentPlayer, message.playerTwoIsBot)
                   //GAME.toggleFlashers(message.currentPlayer)

                    break
                case 'STAGE_BOT':
                    // simulate click event to stage bot
                    triggerEvent(document.getElementById(message.gamePiece), 'click')

                    // pause for effect and send the move
                    setTimeout(function () {
                        socket.send(JSON.stringify({
                            'event': 'MOVE_COMPLETE',
                            'gameID': GAME.id,
                            'currentPlayer': 2,
                            'slotID': message.slotID
                        }))

                        document.getElementById(message.gamePiece).remove()
                    }, 3000)

                    break
            }
        }
    }
}

socket.onerror = function(error) {
    console.log(`DVC socket server error: ${error}`)
}