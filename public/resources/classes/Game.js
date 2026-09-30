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
    this.myPlayerName = null
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
