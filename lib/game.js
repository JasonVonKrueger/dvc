let ScorePatterns = require('./score_patterns.json')
let { buildPatternIndex } = require('./pattern_index.js')
let { buildBotMove } = require('./bot.js')

module.exports = class Game {
    constructor(type) {
        this.id = this._generateGameID(5)
        this.created = (new Date()).toUTCString()
        this.type = type
        this.status = ''
        this.moveStarted = false
        this.currentPlayer = 1
        this.playerOne = {
            joined: false,
            isBot: false,
            score: 0,
            remainingOvals: 45,
            remainingTriangles: 27,
            slots: []
        }
        this.playerTwo = {
            joined: false,
            isBot: false,
            score: 0,
            remainingOvals: 45,
            remainingTriangles: 27,
            slots: []
        }
        this.patterns = []
        this.availableSlots = ["oval1293","oval1295","oval1297","oval1299","oval1301","oval1303","oval1305","oval1307","oval1309","oval1311","oval1313","oval1315","oval1317","oval1319","oval1321","oval1323","oval1325","oval1327","oval1329","oval1331","oval1333","oval1335","oval1337","oval1339","oval1341","oval1343","oval1345","oval1347","oval1349","oval1351","oval1353","oval1355","oval1357","oval1359","oval1361","oval1363","oval1365","oval1367","oval1369","oval1371","oval1373","oval1375","oval1377","oval1379","oval1381","oval1383","oval1385","oval1387","oval1389","oval1391","oval1393","oval1395","oval1397","oval1399","oval1401","oval1403","oval1405","oval1409","oval1411","oval1413","oval1415","oval1417","oval1419","oval1421","oval1423","oval1425","oval1427","oval1429","oval1431","oval1433","oval1435","oval1437","oval1439","oval1441","oval1443","oval1445","oval1447","oval1449","oval1451","oval1453","oval1455","oval1457","oval1459","oval1461","oval1463","oval1465","oval1467","oval1469","oval1471","oval1473","triangle120","triangle122","triangle124","triangle126","triangle128","triangle130","triangle132","triangle134","triangle136","triangle138","triangle140","triangle142","triangle144","triangle146","triangle148","triangle150","triangle152","triangle154","triangle156","triangle158","triangle160","triangle162","triangle164","triangle166","triangle168","triangle170","triangle172","triangle174","triangle176","triangle178","triangle180","triangle182","triangle184","triangle186","triangle188","triangle190","triangle192","triangle194","triangle196","triangle198","triangle200","triangle202","triangle204","triangle206","triangle208","triangle210","triangle212","triangle214","triangle216","triangle218","triangle220","triangle222","triangle224","triangle226"]

        // Reverse index: slotID -> [{ symbol, index, points }, ...]
        // Built once so every move only has to check the handful of patterns
        // that actually touch the slot that was just filled.
        this.patternIndex = buildPatternIndex(ScorePatterns)

        // Tracks which pattern instances have already been scored, per symbol,
        // e.g. { flower: Set(3, 7), circle: Set(0) }. A pattern instance can
        // only ever be claimed once — by whichever player completes it first.
        this.claimedPatterns = {}
        Object.keys(ScorePatterns).forEach((symbol) => {
            this.claimedPatterns[symbol] = new Set()
        })
    }

    // ****************************************************************
    // remove slot from available
    removeSlot = function(slotID) {
        return this.availableSlots.filter(function(slot_id) {
            return slotID != slot_id
        })
    }

    // ****************************************************************
    // check for scoring patterns completed by the piece that was just placed
    //
    // player_slots: array of ALL slot IDs currently occupied by this player
    // lastPlacedSlotID: the slot ID of the piece that was just placed
    //
    // Returns an array (possibly empty, possibly with more than one entry --
    // a single placement can complete more than one symbol at once) of:
    //   { symbol, points, slots }
    checkForScoringPattern = function(player_slots, lastPlacedSlotID) {
        let matches = []

        let candidates = this.patternIndex[lastPlacedSlotID] || []

        for (let i = 0; i < candidates.length; i++) {
            let { symbol, index, points } = candidates[i]

            // already scored by someone earlier in the game -- skip
            if (this.claimedPatterns[symbol].has(index)) continue

            let group = ScorePatterns[symbol].symbol_slots[index]
            let complete = group.every(function(slotID) {
                return player_slots.includes(slotID)
            })

            if (complete) {
                this.claimedPatterns[symbol].add(index)
                matches.push({ symbol: symbol, points: points, slots: group })
            }
        }

        return matches
    }

    // ****************************************************************
    // bot's turn -- uses the heuristic bot intelligence (bot.js) to pick
    // the best available move: win now > block opponent > build toward a
    // pattern > keep options open. See bot.js for the full explanation.
    botSelectPiece = function() {
        let move = buildBotMove(this, 'playerTwo')

        if (!move) {
            // no legal move left (shouldn't normally happen -- the game
            // should be declared over before this point)
            return JSON.stringify({ type: 'BROADCAST',
                                    event: 'STAGE_BOT',
                                    gameID: this.id,
                                    availableSlots: this.availableSlots,
                                    gamePiece: null,
                                    slotID: null,
                                    currentPlayer: 2 })
        }

        let piece = move.pieceType === 'oval'
            ? 'blackOval' + this.playerTwo.remainingOvals--
            : 'blackTriangle' + this.playerTwo.remainingTriangles--

        // remove from available slots
        this.availableSlots = this.removeSlot(move.slotID)

        return JSON.stringify({ type: 'BROADCAST',
                                event: 'STAGE_BOT',
                                gameID: this.id,
                                availableSlots: this.availableSlots,
                                gamePiece: piece,
                                slotID: move.slotID,
                                currentPlayer: 2 })
    }

    compareSymbolArrays = function(symbol_slots, player_slots)  {
        for (var index=0; index<symbol_slots.length; index++) {
            if (!player_slots.includes(symbol_slots[index])) {
              return false
            }
          }
        return true;
    }

    /* ************************************************************** */
    /* private functions */
    /* ************************************************************** */

    _generateGameID = function(length) {
        let id = ''
        let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        let charactersLength = characters.length

        for (let i = 0; i < length; i++) {
            id += characters.charAt(Math.floor(Math.random() * charactersLength))
        }

        return id
    }

    _getRandomInt = function(min, max) {
        min = Math.ceil(min)
        max = Math.floor(max)
        return Math.floor(Math.random() * (max - min + 1)) + min
    }
}