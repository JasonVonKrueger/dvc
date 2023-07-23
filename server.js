/* ************************************************************************************
    @desc - single server process that serves pages and handles sockets
************************************************************************************ */
const GAMES = []
const GAME_ID_LENGTH = 5
const config = require('./conf/server')
const Game = require('./lib/game')
const express = require('express')
const WebSocket = require('ws')
const path = require('path')
const app = express()
app.use('/', express.static(path.join(__dirname, 'public')))
app.use(express.json())

// Set up a headless websocket server that prints any events that come in
const wss = new WebSocket.Server({ noServer: true, path: '/sockets' })

// listen for websocket events
wss.on('connection', function(socket) {
    socket.on('message', function(message) {
        let answer = null
        message = JSON.parse(message.toString())      
    })
})

const server = app.listen(config.devserver.port, function() {
    console.log(`DVC app listening on port ${config.devserver.port}`)
})

server.on('upgrade', function(request, socket, head) {
    wss.handleUpgrade(request, socket, head, function(socket) {
        wss.emit('connection', socket, request)
  })
})

app.get('/create/:gameType', function(req, res) {
    let game = createGame(req.params.gameType)
    res.send(game)
})

app.get('/join/:gameID/:playerNumber', function(req, res) {
    let game = joinGame(req.params.gameID, req.params.playerNumber)
    res.send(game)
})

app.get('/listgames', function(req, res) {
    res.send(GAMES) 
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
______                _   _                 ___                  _   _             
|  ___|              | | (_)               |_  |                | | (_)            
| |_ _   _ _ __   ___| |_ _  ___  _ __       | |_   _ _ __   ___| |_ _  ___  _ __  
|  _| | | | '_ \ / __| __| |/ _ \| '_ \      | | | | | '_ \ / __| __| |/ _ \| '_ \ 
| | | |_| | | | | (__| |_| | (_) | | | | /\__/ / |_| | | | | (__| |_| | (_) | | | |
\_|  \__,_|_| |_|\___|\__|_|\___/|_| |_| \____/ \__,_|_| |_|\___|\__|_|\___/|_| |_|                                                                                  
                                                                                   
************************************************************************************ */

function createGame(gameType) {
    let game =  new Game(gameType)

    if (game.id) {
        GAMES.push(game)
        return { gameID: game.id }
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

        return JSON.stringify({ gameStatus: currentGame.status, gameID: gameID })
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
 function completeMove(gameID, slotID) { 
    let symbol_formed = null
    let currentGame = getGameIndex(gameID)
    
    // remove the slot from available slots 
    currentGame.availableSlots = currentGame.removeSlot(slotID)

    if (currentGame.currentPlayer == 1) {
        currentGame.playerOne.slots.push(slotID)
        symbol_formed = currentGame.checkForScoringPattern(currentGame.playerOne.slots)
    }

    if (currentGame.currentPlayer == 2) {
       currentGame.playerTwo.slots.push(slotID)
       symbol_formed = currentGame.checkForScoringPattern(currentGame.playerTwo.slots)
    }

    if (symbol_formed.match_found) {
        // !!!!!!  SCORE!!!!!!!
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
                                    playerOneScore: currentGame.playerOne.score,
                                    playerTwoScore: currentGame.playerTwo.score  }));
    }

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
 // send messages to the players in a game
 function broadcast(message) {
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message) 
        }
    })
}

// ****************************************************************
// get active game index
function getGameIndex(gameID) {
    if (GAMES) {
        for (i=0; i<GAMES.length; i++) {
            if (GAMES[i].id === gameID) {
                return GAMES[i]
            }      
        }
    }
    
    return false
}

// function generateGameID(length) {
//     let id = ''
//     let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
//     let charactersLength = characters.length

//     for (let i = 0; i < length; i++) {
//         id += characters.charAt(Math.floor(Math.random() * charactersLength))
//     }

//     // make sure it doesn't exist already
//     if (getGameIndex(id)) {
//         // call function again to regenerate a new id
//     }

//     return id
// }


