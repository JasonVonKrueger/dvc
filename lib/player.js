module.exports = class Player {
    constructor(id) {
    	this.id = id
        this.isOnline = false
        this.isBot = false
        this.score = 0
        this.slots = []
        this.remainingOvals = 45
        this.remainingTriangles = 27
    }

    // ****************************************************************
    // this is for the bot
    selectPiece = function () {
        if (this.isBot) {
            let piece = null,
                random_slot = null,
                slotID = null
            let triangle_slots = this.availableSlots.filter(slot => slot.indexOf('triangle') > -1)
            let oval_slots = this.availableSlots.filter(slot => slot.indexOf('oval') > -1)

            if (triangle_slots && oval_slots) {
                if (Math.random() < 0.5) {
                    random_slot = Math.floor(Math.random() * oval_slots.length)
                    slotID = oval_slots[random_slot]
                    piece = 'blackOval' + this.player2.remainingOvals--
                } else {
                    random_slot = Math.floor(Math.random() * triangle_slots.length)
                    slotID = triangle_slots[random_slot]
                    piece = 'blackTriangle' + this.player2.remainingTriangles--
                }
            } else if (!triangle_slots) {
                random_slot = Math.floor(Math.random() * oval_slots.length)
                slotID = oval_slots[random_slot]
                piece = 'blackOval' + this.player2.remainingOvals--
            } else if (!oval_slots) {
                random_slot = Math.floor(Math.random() * triangle_slots.length)
                slotID = triangle_slots[random_slot]
                piece = 'blackTriangle' + this.player2.remainingTriangles--
            }



            // testing autoplay
            if (piece.indexOf('Oval') > -1) {
                var m = ["oval1425", "oval1427", "oval1429", "oval1417", "oval1419", "oval1421"]
                for (var index = 0; index < m.length; index++) {
                    if (this.availableSlots.includes(m[index])) {
                        slotID = m[index]
                    }
                }
            } else {
                var n = ["triangle190", "triangle178", "triangle180", "triangle182", "triangle184", "triangle208"]
                for (var index = 0; index < n.length; index++) {
                    if (this.availableSlots.includes(n[index])) {
                        slotID = n[index]
                    }
                }
            }

            // remove from available slots
            this.availableSlots = this.removeSlot(slotID)

            return JSON.stringify({
                type: 'BROADCAST',
                event: 'STAGE_BOT',
                gameID: this.id,
                availableSlots: this.availableSlots,
                gamePiece: piece,
                slotID: slotID,
                currentPlayer: 2
            })

        }
    }

}
