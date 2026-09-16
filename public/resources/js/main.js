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
loadPlayerName().then(function (name) {
    GAME.myPlayerName = name
})

// a shared "Play a Friend" link looks like /?join=X7K9P
const joinCode = new URLSearchParams(window.location.search).get('join')

// wait for the actual data-include fragments (splash screen, modals, board
// SVG) to finish loading rather than guessing at a fixed delay -- on a slow
// mobile connection a fixed delay can expire before the buttons even exist
// in the DOM yet, which is why a first tap can appear to do nothing
window.includesLoaded.then(function () {
    initEventListeners()

    if (joinCode) {
        joinAsGuest(joinCode.toUpperCase())
    }
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
        GAME.type = '(friend)'
        $('#twoPlayerModal').classList.remove('hidden')
    })

    /* --------------------------------------------------------- */
    // local "pass and play" -- one device, both players take turns
    $('#iconLocalPlayer').addEventListener('click', function(e) {
        createGame('(local)')
    })

    /* --------------------------------------------------------- */
    $('#btnGetGameCode').addEventListener('click', async function(e) {
        e.preventDefault()
        await createGame('(friend)')

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
    $('#btnCopy').addEventListener('click', async function(e) {
        const codeInput = $('#inpCreateGameCode')
        const code = codeInput ? codeInput.value : ''

        try {
            await navigator.clipboard.writeText(code)
        } catch (err) {
            // fall back to legacy selection-based copy for older browsers
            if (codeInput) {
                codeInput.focus()
                codeInput.select()
                document.execCommand('copy')
            }
        }

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
        $('#point-values-modal').classList.remove('hidden')
        $('.modal-content').classList.add('modal-zoom-in')
    })

    /* --------------------------------------------------------- */
    $('#btnOpenOptions').addEventListener('click', function(e) {
        closeModal('point-values-modal')
        $('#game-options').classList.remove('hidden')
        $('.modal-content').classList.add('modal-zoom-in')
    })

    /* --------------------------------------------------------- */
    $('#point-values-modal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal('point-values-modal')
        }
    })

    /* --------------------------------------------------------- */
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !$('#point-values-modal').classList.contains('hidden')) {
            closeModal('point-values-modal')
        }
    })

    /* --------------------------------------------------------- */
    $('#fol-container').addEventListener('click', function(e) {
        //e.preventDefault()
        let slot = document.getElementById(e.target.id)
        if (!slot) return

        // direct placement: no piece pre-selected from the cup -- tapping the
        // slot both picks and places a matching piece from the current cup
        if (isDirectPlacementEnabled()) {
            placeDirectlyOnSlot(slot)
            return
        }

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
    $('#inpJoinGameCode').addEventListener('input', function(e) {
        e.target.value = e.target.value.toUpperCase()
        $('#btnJoinGame').disabled = e.target.value.trim().length !== 5
    })

    /* --------------------------------------------------------- */
    $('#btnJoinGame').addEventListener('click', async function(e) {
        e.preventDefault()
        const code = $('#inpJoinGameCode').value.trim().toUpperCase()
        if (code.length !== 5) return
        await joinAsGuest(code)
    })

    /* --------------------------------------------------------- */
    $('#btnTakeThyLeave').addEventListener('click', function(e) {
        window.location.reload()
    })

    /* --------------------------------------------------------- */
    $('#btnExitGame').addEventListener('click', function(e) {
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
        await joinGame(1) // mark the host as joined
    }

    if (type === '(local)') {
        await joinGame(1) // player 1 join
        joinGame(2) // player 2 join, same device
    }
}

// ****************************************************************
// AJAX to join a game
async function joinGame(playerNumber) {
    if (GAME.id) {
        connectGameStream(GAME.id)
    }

    let response = await fetch(`/join/${GAME.id}/${playerNumber}`)
    let data = await response.json()

    if (data.errMsg) {
        showToast(data.errMsg)
        return false
    }

    if (playerNumber == GAME.myPlayerNumber) {
        GAME.myPlayerName = data.playerName
    }

    // local pass-and-play controls both players from one device -- remember
    // both names so turn-change prompts can address whoever's up next
    if (GAME.type === '(local)') {
        if (playerNumber === 1) GAME.playerOneName = data.playerName
        if (playerNumber === 2) GAME.playerTwoName = data.playerName
    }

    if (data.gameStatus === 'ready') {
        postData('/do', { event: 'START_GAME', gameID: GAME.id })
    }

    return true
}

// ****************************************************************
// AJAX to join a friend's game as player 2 using a shared code
async function joinAsGuest(gameID) {
    GAME.id = gameID
    GAME.type = '(friend)'
    GAME.myPlayerNumber = 2

    const joined = await joinGame(2)
    if (!joined) return

    $('#twoPlayerModal').classList.add('hidden')
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
    $('#twoPlayerModal').classList.add('hidden')
    $('#waitingForPlayer').classList.add('hidden')

    let FOL_WIDTH = $('#svg7243').clientWidth
    cssVars.setProperty('--fol-pedestal-size', FOL_WIDTH + 'px')
    cssVars.setProperty('--fol-pedestal-base-size', FOL_WIDTH + 15 + 'px')

    loadGamePieces()
    updatePlayerLocks()
    updateDirectPlacementLock()
    toggleRotateFol()
}

// ****************************************************************
// in 2-player mode, restrict each player to their own cups and turn
function updatePlayerLocks() {
    if (GAME.type !== '(friend)' && GAME.type !== '(local)') return

    const isMyTurn = (GAME.currentPlayer == GAME.myPlayerNumber)

    const myCups = GAME.myPlayerNumber === 1 ? ['#p1-oval-cup', '#p1-triangle-cup'] : ['#p2-oval-cup', '#p2-triangle-cup']
    const theirCups = GAME.myPlayerNumber === 1 ? ['#p2-oval-cup', '#p2-triangle-cup'] : ['#p1-oval-cup', '#p1-triangle-cup']

    myCups.forEach(selector => $(selector) && $(selector).classList.remove('no-pointer-events'))
    theirCups.forEach(selector => $(selector) && $(selector).classList.add('no-pointer-events'))

    if (isMyTurn) {
        $('#fol-container').classList.remove('no-pointer-events')
    } else {
        $('#fol-container').classList.add('no-pointer-events')
    }
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

        if (isAutoZoomEnabled()) {
            $('#fol-container').classList.remove('fol-zoom-out')
            $('#fol-container').classList.add('fol-zoom-in')
        }
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
function score(currentPlayer, playerOneScore, playerTwoScore, symbol, points, slots) {
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

    queuePatternCallout(symbol, points)
}

// ****************************************************************
// "Triangle +1" style medallion callout shown when a pattern completes.
// Patterns are shown one at a time (queued) so a single move that completes
// more than one symbol at once doesn't stack illegible overlapping badges.
const PATTERN_CALLOUT_INFO = {
    triangle:  { label: 'Triangle',  icon: 'ss-1.png' },
    diamond:   { label: 'Diamond',   icon: 'ss-2.png' },
    gem:       { label: 'Jewel',     icon: 'ss-3.png' },
    eye:       { label: 'Eye',       icon: 'ss-4.png' },
    pyramid:   { label: 'Pyramid',   icon: 'ss-5.png' },
    hourglass: { label: 'Hourglass', icon: 'ss-6.png' },
    star:      { label: 'Star',      icon: 'ss-7.png' },
    circle:    { label: 'Circle',    icon: 'ss-8.png' },
    flower:    { label: 'Flower',    icon: 'ss-9.png' }
}

let patternCalloutQueue = []
let patternCalloutBusy = false

function queuePatternCallout(symbol, points) {
    patternCalloutQueue.push({ symbol: symbol, points: points })
    processPatternCalloutQueue()
}

function processPatternCalloutQueue() {
    if (patternCalloutBusy || patternCalloutQueue.length === 0) return

    patternCalloutBusy = true

    const next = patternCalloutQueue.shift()
    const info = PATTERN_CALLOUT_INFO[next.symbol] || { label: next.symbol, icon: 'ss-1.png' }

    let container = $('#pattern-callout-container')
    if (!container) {
        container = document.createElement('div')
        container.id = 'pattern-callout-container'
        document.body.appendChild(container)
    }

    const badge = document.createElement('div')
    badge.className = 'pattern-callout-badge'
    badge.innerHTML =
        '<img class="pattern-callout-icon" src="resources/images/' + info.icon + '" alt="" />' +
        '<div class="pattern-callout-label">' + info.label + '</div>' +
        '<div class="pattern-callout-points">+' + next.points + '</div>'

    container.appendChild(badge)
    sndSymbolFormed.play()

    requestAnimationFrame(function () {
        badge.classList.add('pattern-callout-show')
    })

    setTimeout(function () {
        badge.classList.add('pattern-callout-hide')
        setTimeout(function () {
            badge.remove()
            patternCalloutBusy = false
            processPatternCalloutQueue()
        }, 350)
    }, 1400)
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
            document.getElementById(slotID).style = 'fill:url(#marbleWhiteFill);stroke:#000000;stroke-width:21.9435;stroke-miterlimit:2;stroke-opacity:0.840741';
        }
        else if (currentPlayer === 2) {
            document.getElementById(slotID).style = 'fill:url(#marbleBlackFill);stroke:#ffba8b;stroke-width:21.9435;stroke-miterlimit:2;stroke-opacity:0.840741';
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
        winnerText = 'Player 1 Wins!'
    } else if (p2Score > p1Score) {
        winnerText = 'Player 2 Wins!'
    } else {
        winnerText = "It's a Tie!"
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
// off by default -- read live off the checkbox rather than cached state,
// same as the other option toggles
function isAutoZoomEnabled() {
    const chk = $('#chk-autozoom-fol')
    return chk ? chk.checked : false
}

function toggleAutoZoom() {
    // if turned off mid-zoom, snap the board back to normal size right away
    // instead of leaving it stuck zoomed in until the next move
    if (!isAutoZoomEnabled()) {
        $('#fol-container').classList.remove('fol-zoom-in')
        $('#fol-container').classList.add('fol-zoom-out')
    }
}

// ****************************************************************
// off by default -- syncs the paused/spinning state to the checkbox;
// called both on click and once at board init to apply the current setting
function isRotateFolEnabled() {
    const chk = $('#chk-rotate-fol')
    return chk ? chk.checked : false
}

function toggleRotateFol() {
    $('#fol-container').classList.toggle('fol-no-rotate', !isRotateFolEnabled())
}

// ****************************************************************
// on by default -- when enabled, tapping a slot both picks and places a
// matching piece from the current player's cup, skipping the manual
// select-a-piece-first step
function isDirectPlacementEnabled() {
    const chk = $('#chk-direct-placement')
    return chk ? chk.checked : true
}

// ****************************************************************
// in manual mode, selecting a cup piece is what unlocks the board
// (see stageGamePiece). Direct placement skips that step entirely, so the
// board's own lock has to be driven straight off whose turn it is instead --
// otherwise solo/friend/local games would never unlock it for the next turn.
function updateDirectPlacementLock() {
    if (!isDirectPlacementEnabled()) return

    if (GAME.currentPlayer == GAME.myPlayerNumber) {
        $('#fol-container').classList.remove('no-pointer-events')
    } else {
        $('#fol-container').classList.add('no-pointer-events')
    }
}

async function placeDirectlyOnSlot(slot) {
    if (!GAME.id || slot.classList.contains('slot-taken')) return

    const isOval = slot.id.indexOf('oval') > -1
    const pieceType = isOval ? 'Oval' : 'Triangle'

    // a piece can still be manually staged first (cup pieces keep their own
    // click handler regardless of this setting) -- reuse it if it matches so
    // it doesn't get left behind, selected, in the cup
    let piece = (GAME.activeGamePiece && GAME.activeGamePiece.id.includes(pieceType) && document.body.contains(GAME.activeGamePiece))
        ? GAME.activeGamePiece
        : null

    if (!piece) {
        const cupSelector = (GAME.currentPlayer === 1)
            ? (isOval ? '#p1-oval-cup' : '#p1-triangle-cup')
            : (isOval ? '#p2-oval-cup' : '#p2-triangle-cup')
        piece = document.querySelector(cupSelector + ' .game-piece')
    }

    if (!piece) return // no matching pieces left in this player's cup

    // immediate touch feedback -- doesn't wait on the server round trip
    slot.classList.remove('slot-touch-flash')
    void slot.offsetWidth
    slot.classList.add('slot-touch-flash')
    sndPickPiece.play()

    GAME.activeGamePiece = piece
    piece.remove()

    await postData('/do', { event: 'MOVE_STARTED', currentPlayer: GAME.currentPlayer, gameID: GAME.id })
    postData('/do', { event: 'MOVE_COMPLETE', gameID: GAME.id, currentPlayer: GAME.currentPlayer, slotID: slot.id })
}

// ****************************************************************
function showToast(str, addClass) {
    let duration = Math.max(MIN_DUR, str.length * 80)

    if (!toastContain) {
        toastContain = document.createElement('div')
        toastContain.classList.add('toast-container')
        document.body.appendChild(toastContain)
    }

    // in local pass-and-play the active side changes every turn, so
    // re-check placement on every toast instead of only at creation
    toastContain.classList.remove('toast-container-p1', 'toast-container-p2')
    toastContain.classList.add(GAME.myPlayerNumber == 2 ? 'toast-container-p2' : 'toast-container-p1')

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
