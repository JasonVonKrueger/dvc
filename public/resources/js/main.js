/**
 *  Main script for the Da Vinci's Challenge app
 */
"use strict"

const $ = (selector, scope = document) => scope.querySelector(selector)
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector))

const cssVars = document.documentElement.style
const sndClick = new Howl({ src: ['resources/sounds/click.webm', 'resources/sounds/click.mp3'] })
const sndDroppingPieces = new Howl({ src: ['resources/sounds/dropping-pieces.webm', 'resources/sounds/dropping-pieces.mp3'] })
const sndPickPiece = new Howl({ src: ['resources/sounds/pickpiece.webm', 'resources/sounds/pickpiece.mp3'] })
const sndBackgroundMusic = new Howl({ src: ['resources/sounds/davinci-music.webm', 'resources/sounds/davinci-music.mp3'], loop: true })
const sndSymbolFormed = new Howl({ src: ['resources/sounds/symbol-formed.webm', 'resources/sounds/symbol-formed.mp3'] })


const GAME = new Game()
const FADE_DUR = 700
const MIN_DUR = 4000

let backgroundMusicID = null
let toastContain = null
let pendingScoreHighlights = []

// ****************************************************************
// Game entry point
// *****************************************************************
window.addEventListener("load", function () {
    loadPlayerName().then(function (name) {
        GAME.myPlayerName = name
    })

    window.setTimeout(function () {
        initEventListeners()
    }, 3000)
})

// ****************************************************************
// Function conjunction
// ****************************************************************

// ****************************************************************
// event handlers
function initEventListeners() {

    /* --------------------------------------------------------- */
    // add mousedown listener for buttons
    $$('.clicker').forEach(function(clicker) {
        clicker.addEventListener('mousedown', function(e) {
            sndClick.play()
        })
    })

    /* --------------------------------------------------------- */
    $('#iconSinglePlayer').addEventListener('click', function(e) {
        createGame('(solo)')
    })

    /* --------------------------------------------------------- */
    $('#iconDoublePlayer').addEventListener('click', function(e) {
        createGame('(friend)')
    })

    /* --------------------------------------------------------- */
    $('#btnGetGameCode').addEventListener('click', function(e) {
        e.preventDefault()
        $('#btnGetGameCode').classList.add('hidden')
        $('#inpCreateGameCode').classList.remove('hidden')
        $('#sectionCopyCode').classList.remove('hidden')

        const codeInput = $('#inpCreateGameCode')
        if (codeInput) {
            codeInput.focus()
            codeInput.select()
        }
    })

    /* --------------------------------------------------------- */
    $('#btnCopy').addEventListener('click', function(e) {
        document.execCommand("copy")  

        $('#waitingForPlayer').classList.remove('hidden')

        // do the letter spinning thing
        const txt = " Waiting for player 2 to join..."
        for (let c in txt) {
            let char = txt[c]
            const el = document.createElement("span");

            if (char === ' ') {
                el.setAttribute('style', 'width: 6px')
            } 
            else {
                let m = '--i:' + c;
                el.setAttribute('style', m);
            }

            el.innerText = char;
            document.getElementById('txtWaiting').appendChild(el);
        }
    })
    
    /* --------------------------------------------------------- */
    $('#iconRules').addEventListener('click', function(e) {
        e.preventDefault()
        $('#game-rules').classList.remove('hidden')
        $('.modal-content ').classList.add('modal-zoom-in')
    })

    /* --------------------------------------------------------- */
    $('#menu-icon').addEventListener('click', function(e) {
        //e.preventDefault()
        $('#game-options').classList.remove('hidden')
        $('.modal-content').classList.add('modal-zoom-in')
    })

    /* --------------------------------------------------------- */
    $('#fol-container').addEventListener('click', function(e) {
        //e.preventDefault()
        let slot = document.getElementById(e.target.id)
       
        // get object array index from selected piece
        let index = slot.id.match(/\d+/)
    
        // handle moves
        if (GAME.moveStarted) {
            if (!slot.classList.contains('slot-taken')) {
                if ((slot.id.indexOf('oval') > -1 && GAME.activeGamePiece.id.includes('Oval')) || (slot.id.indexOf('triangle') > -1 && GAME.activeGamePiece.id.includes('Triangle'))) {
                    postData('/do', { event: 'MOVE_COMPLETE', gameID: GAME.id, 'gameID': GAME.id, 'currentPlayer': GAME.currentPlayer, 'slotID': slot.id })    
                    document.getElementById(GAME.activeGamePiece.id).remove()
                }
            }
        }
    })

    /* --------------------------------------------------------- */
    $('#btnTakeThyLeave').addEventListener('click', function(e) {
        window.location.reload()
    })
}

/* ************************************************************************************
______                _   _                 ___                  _   _             
|  ___|              | | (_)               |_  |                | | (_)            
| |_ _   _ _ __   ___| |_ _  ___  _ __       | |_   _ _ __   ___| |_ _  ___  _ __  
|  _| | | | '_ \ / __| __| |/ _ \| '_ \      | | | | | '_ \ / __| __| |/ _ \| '_ \ 
| | | |_| | | | | (__| |_| | (_) | | | | /\__/ / |_| | | | | (__| |_| | (_) | | | |
\_|  \__,_|_| |_|\___|\__|_|\___/|_| |_| \____/ \__,_|_| |_|\___|\__|_|\___/|_| |_|                                                                                  
                                                                                   
************************************************************************************ */

// ****************************************************************
// for simulating events
function triggerEvent(elem, event) {
    if (!elem) return
    let clickEvent = new Event(event)
    elem.dispatchEvent(clickEvent)
}

// ****************************************************************
// AJAX to create a game
async function createGame(type) {
    let url = `/create/${type}`

    // reuse the name this device was given previously, if there is one
    if (GAME.myPlayerName) {
        url += `?playerName=${encodeURIComponent(GAME.myPlayerName)}`
    }

    let response = await fetch(url)
    let data = await response.json()
   
    GAME.id = data.gameID
    GAME.type = type
    GAME.myPlayerNumber = 1
    GAME.myPlayerName = data.playerName

    connectGameStream(GAME.id)

    // set the Game code input for two player modal
    const codeInput = $('#inpCreateGameCode')
    if (codeInput) {
        codeInput.value = GAME.id
    }

    if (type === '(solo)') {
        await joinGame(1) // player 1 join
        joinGame(2) // player 2 join (bot)
    }

    if (type === '(friend)') {
        $('#twoPlayerModal').classList.remove('hidden')

        let title = "Da Vinci's Challenge"
        let url = 'https://dev.davincischallenge.app/join/' + GAME.id
        let text = "Let's play!"

        try {
            await navigator.share({title, url, text})
    
            /* Show a message if the user shares something */
            alert('Message sent!')
        } 
        catch (err) {
            /* This error will appear if the user cancels the action of sharing. */
            //alert(`Sharing API not supported on your browser. Error:\n\n${err}`)
        }
    }



    //initBoard()
   // GAME.start()

}

// ****************************************************************
// AJAX to join a game
async function joinGame(playerNumber) {
    if (GAME.id) {
        connectGameStream(GAME.id)
    }

    let response = await fetch(`/join/${GAME.id}/${playerNumber}`)
    let data = await response.json()

    if (playerNumber == GAME.myPlayerNumber) {
        GAME.myPlayerName = data.playerName
    }

    if (data.gameStatus === 'ready') {
        postData('/do', { event: 'START_GAME', gameID: GAME.id })
    }
}

// ****************************************************************
// State recovery from server for rehydration / refresh
async function restoreGameState(gameID) {
    try {
        let response = await fetch(`/game/${gameID}/state`)
        if (!response.ok) return false
        let data = await response.json()

        GAME.id = data.gameID
        GAME.type = data.type
        GAME.currentPlayer = data.currentPlayer
        if (data.playerOne) {
            $('#player1-score').innerHTML = data.playerOne.score || 0
        }
        if (data.playerTwo) {
            $('#player2-score').innerHTML = data.playerTwo.score || 0
        }

        connectGameStream(gameID)
        return true
    } catch (err) {
        console.error('Error restoring game state:', err)
        return false
    }
}

// ****************************************************************
// AJAX posting
async function postData(url = '', data = {}) {
    const response = await fetch(url, { 
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
    })

    return response.json()
}

// ****************************************************************
// initialize the game board layout
function initBoard() {
    const splash = $('#splash-screen')
    splash.style.height = '0%'
    splash.classList.add('no-pointer-events')
    // wait for the collapse transition before removing it from the layout
    setTimeout(() => splash.classList.add('hidden'), 500)
    $('#smoke-vid').classList.add('hidden')
    $('#fol-container').classList.remove('hidden')
    $('#player-cup-container').classList.remove('hidden')

    let FOL_WIDTH = $('#svg7243').clientWidth
    cssVars.setProperty('--fol-pedestal-size', FOL_WIDTH + 'px')
    cssVars.setProperty('--fol-pedestal-base-size', FOL_WIDTH + 15 + 'px')

    loadGamePieces()
}

// ****************************************************************
// load initial game pieces
function loadGamePieces() {
    // fill up the bowls
    // 45 ovals and 27 triangles for each player (or 1/4 in dev testing mode)
    // 144 total spaces on the board
    
    sndDroppingPieces.play()

    const isDevTesting = $('#chk-dev-testing') && $('#chk-dev-testing').checked
    const totalOvals = isDevTesting ? Math.ceil(45 / 4) : 45
    const totalTriangles = isDevTesting ? Math.ceil(27 / 4) : 27

    // white ovals
    for (let i = 1; i <= totalOvals; i++) {
        let whiteOval = new GamePiece('whiteOval', '#p1-oval-cup', i)
        GAME.white_ovals.push(whiteOval)
    }

    // white triangles
    for (let i = 1; i <= totalTriangles; i++) {
        let whiteTriangle = new GamePiece('whiteTriangle', '#p1-triangle-cup', i)
        GAME.white_triangles.push(whiteTriangle)
    }

    // black ovals (numbered 45 down to match server bot piece IDs)
    let startBlackOval = 45 - totalOvals + 1
    for (let i = startBlackOval; i <= 45; i++) {
        let blackOval = new GamePiece('blackOval', '#p2-oval-cup', i)
        GAME.black_ovals.push(blackOval)
    }

    // black triangles (numbered 27 down to match server bot piece IDs)
    let startBlackTriangle = 27 - totalTriangles + 1
    for (let i = startBlackTriangle; i <= 27; i++) {
        let blackTriangle = new GamePiece('blackTriangle', '#p2-triangle-cup', i)
        GAME.black_triangles.push(blackTriangle)
    }
}

// ****************************************************************
// slide the piece to its staging position
function stageGamePiece() {
    if (GAME.currentPlayer == GAME.myPlayerNumber) {
        $('#fol-container').classList.remove('no-pointer-events')
        $('#fol-container').classList.remove('fol-zoom-out')
        $('#fol-container').classList.add('fol-zoom-in') 
    }  

    GAME.activeGamePiece = document.getElementById(this.id)

    // disable appropriate slot types
    if (GAME.activeGamePiece.id.indexOf('Oval') > -1) {
        // disable triangle slots
    }

    if (GAME.activeGamePiece.id.indexOf('Triangle') > -1) {
        // disable oval slots
    }

    // allow for dropping selected pieces
    if (!GAME.activeGamePiece.classList.contains('piece-selected')) {
        GAME.activeGamePiece.classList.add('piece-selected')
    }
    else {
        GAME.activeGamePiece.classList.remove('piece-selected')
        return
    }

    if ((GAME.currentPlayer == GAME.myPlayerNumber) || (GAME.currentPlayer == 2 && GAME.type == '(solo)')) {
        if (!GAME.moveStarted) {
            // let the server know that the move started
            postData('/do', { event: 'MOVE_STARTED', currentPlayer: GAME.currentPlayer, gameID: GAME.id })
        }
    }
}

// ****************************************************************
// player scored
function score(currentPlayer, playerOneScore, playerTwoScore, symbol, slots) {
    let points_element = null

    if (currentPlayer == 1) {
        points_element = 'ss_player1_' + symbol

        //document.getElementById(points_element).innerHTML = parseInt(document.getElementById(points_element).innerHTML) + 1
        $('#player1-score').innerHTML = playerOneScore
    } 
    else if (currentPlayer == 2) {
        points_element = 'ss_player2_' + symbol

        //document.getElementById(points_element).innerHTML = parseInt(document.getElementById(points_element).innerHTML) + 1
        $('#player2-score').innerHTML = playerTwoScore
    }

    if (Array.isArray(slots)) {
        pendingScoreHighlights.push(slots)
    }

    //sndSymbolFormed.play(false)
}

function highlightScoredPatterns() {
    pendingScoreHighlights.forEach(function (slots) {
        slots.forEach(function (slotID) {
            const slot = document.getElementById(slotID)
            if (!slot) return

            slot.classList.remove('scored-slot')
            void slot.offsetWidth
            slot.classList.add('scored-slot')
        })
    })

    pendingScoreHighlights = []
}

function closeModal(element) {
    $('.modal-content').classList.remove('modal-zoom-in')
    $('#' + element).classList.add('hidden')
}

// ****************************************************************
// update game board by filling in slot
function updateBoard(currentPlayer, slotID, availableSlots) {
    // fill the slots    
    if (!document.getElementById(slotID).classList.contains('slot-taken')) {

        if (currentPlayer === 1) {
            document.getElementById(slotID).style = 'fill:#eeeeee;fill-opacity:1;stroke:#000000;stroke-width:21.9435;stroke-miterlimit:2;stroke-opacity:0.840741';
        } 
        else if (currentPlayer === 2) {
            document.getElementById(slotID).style = 'fill:#060606;fill-opacity:1;stroke:#ffba8b;stroke-width:21.9435;stroke-miterlimit:2;stroke-opacity:0.840741';
        }

        document.getElementById(slotID).classList.add('slot-taken')

        sndPickPiece.play()  
    }

    if (GAME.currentPlayer == GAME.myPlayerNumber) {
        $('#fol-container').classList.add('no-pointer-events')
    } 

    if (checkGameOver(availableSlots)) {
        return
    }

    postData('/do', { event: 'SWITCH_PLAYER', currentPlayer: GAME.currentPlayer, gameID: GAME.id })
}

// ****************************************************************
// check if the game has ended
function checkGameOver(availableSlots) {
    const p1Ovals = $$('#p1-oval-cup .game-piece').length
    const p1Triangles = $$('#p1-triangle-cup .game-piece').length
    const p2Ovals = $$('#p2-oval-cup .game-piece').length
    const p2Triangles = $$('#p2-triangle-cup .game-piece').length

    const p1TotalPieces = p1Ovals + p1Triangles
    const p2TotalPieces = p2Ovals + p2Triangles

    let openOvalSlots = 0
    let openTriSlots = 0

    if (Array.isArray(availableSlots)) {
        openOvalSlots = availableSlots.filter(s => s.startsWith('oval')).length
        openTriSlots = availableSlots.filter(s => s.startsWith('triangle')).length
    } else {
        openOvalSlots = $$('#fol-container [id^="oval"]:not(.slot-taken)').length
        openTriSlots = $$('#fol-container [id^="triangle"]:not(.slot-taken)').length
    }

    const totalOpenSlots = openOvalSlots + openTriSlots

    // Condition 1: Either player runs out of both oval and triangle pieces
    const playerOutOfPieces = (p1TotalPieces === 0) || (p2TotalPieces === 0)

    // Condition 2: Nowhere to place an oval or triangle
    const p1CanMove = (p1Ovals > 0 && openOvalSlots > 0) || (p1Triangles > 0 && openTriSlots > 0)
    const p2CanMove = (p2Ovals > 0 && openOvalSlots > 0) || (p2Triangles > 0 && openTriSlots > 0)

    const noValidMovesLeft = (totalOpenSlots === 0) || (!p1CanMove && !p2CanMove)

    if (playerOutOfPieces || noValidMovesLeft) {
        showGameOver()
        return true
    }

    return false
}

// ****************************************************************
// show game over screen
function showGameOver() {
    const p1ScoreText = $('#player1-score') ? $('#player1-score').innerText : '0'
    const p2ScoreText = $('#player2-score') ? $('#player2-score').innerText : '0'
    const p1Score = parseInt(p1ScoreText || '0', 10)
    const p2Score = parseInt(p2ScoreText || '0', 10)

    let winnerText = ''
    if (p1Score > p2Score) {
        winnerText = 'Player 1 wins the game!'
    } else if (p2Score > p1Score) {
        winnerText = 'Player 2 wins the game!'
    } else {
        winnerText = "It's a tie!"
    }

    const winnerEl = $('#game-over-winner')
    if (winnerEl) {
        winnerEl.innerText = winnerText
    }

    const modalEl = $('#game-over-modal')
    if (modalEl) {
        modalEl.classList.remove('hidden')
        const contentEl = modalEl.querySelector('.modal-content')
        if (contentEl) {
            contentEl.classList.add('modal-zoom-in')
        }
    }
}

// ****************************************************************
function toggleBGMusic() {
    if ($('#chk-background-music').checked == true) {
        sndBackgroundMusic.play()
    }
    else {
        sndBackgroundMusic.stop()
    }

    // if (sndBackgroundMusic.playing(backgroundMusicID)) {
    //     $('#chk-background-music').checked = false
    //     sndBackgroundMusic.stop()
    // } else {
    //     $('#chk-background-music').checked = true
    //     backgroundMusicID = sndBackgroundMusic.play()
    // }  
}

// ****************************************************************
function toggleSNDEffects() {
    const isMuted = !$('#chk-sound-effects').checked
    sndClick.mute(isMuted)
    sndDroppingPieces.mute(isMuted)
    sndPickPiece.mute(isMuted)
    sndSymbolFormed.mute(isMuted)
}

// ****************************************************************
function showToast(str, addClass) {
    let duration = Math.max(MIN_DUR, str.length * 80)

    if (!toastContain) {
        toastContain = document.createElement('div')
        toastContain.classList.add('toast-container')

        if (GAME.myPlayerNumber == 2) {
            toastContain.classList.add('toast-container-p2')
        }
        else {
            toastContain.classList.add('toast-container-p1')
        }

        document.body.appendChild(toastContain)
    }

    const el = document.createElement('div')
    el.classList.add('toast', addClass)
    el.innerText = str
    toastContain.prepend(el)

    setTimeout(() => el.classList.add('open'))
    setTimeout(
        () => el.classList.remove('open'),
        duration
    )
    setTimeout(
        () => toastContain.removeChild(el),
        duration + FADE_DUR
    )
}
