/**
 *  Main script for the Da Vinci's Challenge app
 */
"use strict"

const $ = document.querySelector.bind(document)
const cssVars = document.documentElement.style
const sndClick = new Howl({ src: ['resources/sounds/click.mp3'] })
const sndDroppingPieces = new Howl({ src: ['resources/sounds/dropping-pieces.mp3'] })
const sndPickPiece = new Howl({ src: ['resources/sounds/pickpiece.mp3'] })
const sndBackgroundMusic = new Howl({ src: ['resources/sounds/davinci-music.mp3'], loop: true })
const sndSymbolFormed = new Howl({ src: ['resources/sounds/symbol-formed.mp3'] })


const GAME = new Game()
const FADE_DUR = 700
const MIN_DUR = 4000

let backgroundMusicID = null
let toastContain = null

// ****************************************************************
// Game entry point
// *****************************************************************
window.addEventListener("load", function () {
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
    Array.from(document.querySelectorAll('.clicker')).forEach(function(clicker) {
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
        // socket.send(JSON.stringify({
        //     'event': 'CREATE_GAME',
        //     'gameType': 'FRIEND'
        //   }))
    })

    /* --------------------------------------------------------- */
    $('#btnGetGameCode').addEventListener('click', function(e) {
        e.preventDefault()
        $('#btnGetGameCode').classList.add('hidden')
        $('#inpCreateGameCode').classList.remove('hidden')
        $('#sectionCopyCode').classList.remove('hidden')

        inpCreateGameCode.focus()
        inpCreateGameCode.select()  
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
            } else {
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

                    // send the move to the server
                    // socket.send(JSON.stringify({
                    //     'event': 'MOVE_COMPLETE',
                    //     'gameID': GAME.id,
                    //     'currentPlayer': GAME.currentPlayer,
                    //     'slotID': slot.id
                    // }))
    
                    document.getElementById(GAME.activeGamePiece.id).remove()
                }
            }
        }
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
    let clickEvent = new Event(event)
    elem.dispatchEvent(clickEvent)
}

// ****************************************************************
// AJAX to create a game
async function createGame(type) {
    let response = await fetch(`/create/${type}`)
    let data = await response.json()
   
    GAME.id = data.gameID
    GAME.type = type
    GAME.myPlayerNumber = 1

    // set the Game code input for two player modal
    inpCreateGameCode.value = GAME.id

    if (type === '(solo)') {
        joinGame(1) // player 1 join
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
    
            //$('#overlay').style.height = '0%'
            //$('#fol-container').classList.remove('hidden')
            //$('#player-cup-container').classList.remove('hidden')
           
            //initBoard()
            //loadGamePieces()
        } catch (err) {
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
    let response = await fetch(`/join/${GAME.id}/${playerNumber}`)
    let data = await response.json()

    if (data.gameStatus === 'ready') {
        postData('/do', { event: 'START_GAME', gameID: GAME.id })
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
    $('#splash-screen').style.height = '0%'
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
    // 45 ovals and 27 triangles for each player
    // 144 total spaces on the board
    
    sndDroppingPieces.play()

    // white ovals
    for (let i = 1; i <= 45; i++) {
        let whiteOval = new GamePiece('whiteOval', '#p1-oval-cup', i)
        GAME.white_ovals.push(whiteOval)
    }

    // white triangles
    for (let i = 1; i <= 27; i++) {
        let whiteTriangle = new GamePiece('whiteTriangle', '#p1-triangle-cup', i)
        GAME.white_triangles.push(whiteTriangle)
    }

    // black ovals
    for (let i = 1; i <= 45; i++) {
        let blackOval = new GamePiece('blackOval', '#p2-oval-cup', i)
        GAME.black_ovals.push(blackOval)
    }

    // black triangles
    for (let i = 1; i <= 27; i++) {
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
function score(currentPlayer, playerOneScore, playerTwoScore, symbol) {
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

    //sndSymbolFormed.play(false)
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

    postData('/do', { event: 'SWITCH_PLAYER', currentPlayer: GAME.currentPlayer, gameID: GAME.id })
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
    if ($('#chk-sound-effects').checked == true) {
        
    }
    else {
        
    }
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
