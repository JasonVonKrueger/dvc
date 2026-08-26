/*******************************************************************/
/* Game pieces (white triangle, white oval, black triangle, black oval) */

class GamePiece {
  constructor(gamePiece, cup, index) {
    this.piece = document.createElement('img')
    this.piece.src = 'resources/images/' + gamePiece + '.png'
    this.piece.id = gamePiece + index
    this.piece.className = 'game-piece'

    const randomOffset = () => Math.round((Math.random() * 20) - 10)
    const randomRotation = Math.round((Math.random() * 24) - 12)
    this.piece.style.setProperty('--piece-offset-x', randomOffset() + 'px')
    this.piece.style.setProperty('--piece-offset-y', randomOffset() + 'px')
    this.piece.style.setProperty('--piece-rotation', randomRotation + 'deg')

    document.querySelector(cup).appendChild(this.piece)

    // add event listener to move the the 'ready' position
    this.piece.addEventListener('click', stageGamePiece)
  }

  destroy = function () {
    this.piece.remove()
  }

}