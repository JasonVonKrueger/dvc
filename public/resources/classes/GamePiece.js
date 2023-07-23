/*******************************************************************/
/* Game pieces (white triangle, white oval, black triangle, black oval) */

class GamePiece {
  constructor(gamePiece, cup, index) {

    this.piece = document.createElement('img')
    this.piece.src = 'resources/images/' + gamePiece + '.png'
    this.piece.id = gamePiece + index
    this.piece.className = 'game-piece'
    document.querySelector(cup).appendChild(this.piece)

    // add event listener to move the the 'ready' position
    this.piece.addEventListener('click', stageGamePiece)
  }

  destroy = function () {
    this.piece.remove()
  }

}