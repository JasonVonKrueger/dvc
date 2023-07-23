/*******************************************************************/
/* Game */
class Game {
  constructor() {
    this.inProgress = false
    this.activeGamePiece = null
    this.difficultyLevel = 1
    this.type = null
    this.moveStarted = false
    this.currentPlayer = 1
    this.myPlayerNumber = 1
    this.available_slots = []
    
    // this.playerOne = new Player(1)
    // this.playerTwo = new Player(2)

    this.filledSlots = []
    
    this.available_oval_slots = []
    this.available_tri_slots = []
    this.playerOneOvals = []
    this.playerOneTriangles = []
    this.playerTwoOvals = []
    this.playerTwoTriangles = []

    this.white_ovals = []
    this.black_ovals = []
    this.white_triangles = []
    this.black_triangles = []
  }

  /* --------------------------------------------------------- */
  // create = function(gameType) {
  //   this.type = gameType

  //   socket.send(JSON.stringify({
  //     'event': 'CREATE_GAME',
  //     'gameType': this.type
  //   }))
  // }

  /* --------------------------------------------------------- */
  // start = function() {
  //   this.inProgress = true

  //   socket.send(JSON.stringify({
  //     'event': 'START_GAME',
  //     'gameID': this.id
  //   }))
  // }

  /* --------------------------------------------------------- */
  // join = function(isBot) {
  //   this.inProgress = true

  //   socket.send(JSON.stringify({
  //     'event': 'JOIN_GAME',
  //     'gameID': this.id,
  //     'isBot': isBot
  //   }))
  // }

  /* --------------------------------------------------------- */
  // switchPlayer = function (currentPlayer, isBot) {
  //   GAME.currentPlayer = currentPlayer

  //   // is player 2 a bot?
  //   if (currentPlayer === 2 && isBot) {
  //     socket.send(JSON.stringify({
  //       'event': 'GO_BOT',
  //       gameID: GAME.id
  //     }))
  //   }
  // }

  /* --------------------------------------------------------- */
  toggleFlashers = function(currentPlayer) {
    if (currentPlayer === 1) {
      $('#cupBlackTriangles').classList.remove('my-turn')
      $('#cupBlackOvals').classList.remove('my-turn')

      $('#cupWhiteTriangles').classList.add('my-turn')
      $('#cupWhiteOvals').classList.add('my-turn')
    } 
    else {
      $('#cupWhiteTriangles').classList.remove('my-turn')
      $('#cupWhiteOvals').classList.remove('my-turn')

      $('#cupBlackTriangles').classList.add('my-turn')
      $('#cupBlackOvals').classList.add('my-turn')
    }
  }  

}
