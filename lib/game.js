let ScorePatterns = require('./score_patterns.json')

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
    }

    // ****************************************************************
    // toggle player    
    // toggleCurrentPlayer = function(currentPlayer) {
    //     // switch player
    //     this.currentPlayer = (currentPlayer === 1) ? 2 : 1

    //     return JSON.stringify({ type: 'BROADCAST', 
    //                             event: 'SWITCH_PLAYER', 
    //                             gameID: this.id, 
    //                             currentPlayer: this.currentPlayer,
    //                             playerTwoIsBot: this.playerTwo.isBot })
    // }

    // ****************************************************************
    // remove slot from available    
    removeSlot = function(slotID) {
        return this.availableSlots.filter(function(slot_id) { 
            return slotID != slot_id
        })
    }  

    // ****************************************************************
    // check for scoring patterns   
    checkForScoringPattern = function(player_slots) {
        console.log('Checking for score pattern....')
        let data = { match_found: false }

        // loop through each symbl and search the patterns
        Object.keys(ScorePatterns).forEach(function(key) {
            let symbol = key
            let points = ScorePatterns[key].points

            console.log(`symbol = ${symbol} and points = ${points}`)

            // for each array of patterns, check to see if player has those filled
            for (var i=0; i<ScorePatterns[key].symbol_slots.length; i++) {
                let pattern_length = ScorePatterns[key].symbol_slots[i].length
                let matches = 0

                for (var ii=0; ii<pattern_length; ii++) {
                    if (player_slots.includes(ScorePatterns[key].symbol_slots[i][ii])) {
                       matches++
                       console.log('matches = ' + matches)
                    }          
                }

                if (matches === pattern_length) {
                    ScorePatterns[key].symbol_slots.splice(i)
                    console.log(symbol)
                    console.log(points)

                    data.match_found = true
                    data.symbol = symbol
                    data.points = points

                    //return { 'symbol': symbol, 'points': points, 'slots': player_slots }
                }           
            } 
        })

        return data
    }

    // ****************************************************************
    // bot's turn
    botSelectPiece = function() {
        let piece = null, 
            random_slot = null,
            slotID = null,
            triangle_slots = this.availableSlots.filter(slot => slot.indexOf('triangle') > -1),
            oval_slots = this.availableSlots.filter(slot => slot.indexOf('oval') > -1)


        // Example
        // console.log(Math.random() < 0.1); //10% probability of getting true
        // console.log(Math.random() < 0.4); //40% probability of getting true
        // console.log(Math.random() < 0.5); //50% probability of getting true
        // console.log(Math.random() < 0.8); //80% probability of getting true
        // console.log(Math.random() < 0.9); //90% probability of getting true

        // randomly pick an oval or triangle
        let isOvalPicked = Math.random() < 0.5

        if (isOvalPicked) {
            random_slot = this._getRandomInt(0, oval_slots.length)
            slotID = oval_slots[random_slot]
            piece = 'blackOval' + this.playerTwo.remainingOvals--            
        } 
        else {
            random_slot = this._getRandomInt(0, triangle_slots.length)
            slotID = triangle_slots[random_slot]
            piece = 'blackTriangle' + this.playerTwo.remainingTriangles--
        }


        // if (this._pickOvalOrTri() === 'oval') {
        //     slotID = oval_slots[rand_oval_slot]
        //     piece = 'blackOval' + this.playerTwo.remainingOvals--
        // }
        // else {
        //     slotID = triangle_slots[rand_tri_slot]
        //     piece = 'blackTriangle' + this.playerTwo.remainingTriangles--
        // }

        // if (triangle_slots && oval_slots) {
        //     if (Math.random() < 0.5) {
        //         random_slot = Math.floor(Math.random() * oval_slots.length)
        //         slotID = oval_slots[random_slot]
        //         piece = 'blackOval' + this.playerTwo.remainingOvals--
        //     }
        //     else {
        //         random_slot = Math.floor(Math.random() * triangle_slots.length)
        //         slotID = triangle_slots[random_slot]
        //         piece = 'blackTriangle' + this.playerTwo.remainingTriangles--
        //     }
        // }
        // else if (!triangle_slots) {
        //     random_slot = Math.floor(Math.random() * oval_slots.length)
        //     slotID = oval_slots[random_slot]
        //     piece = 'blackOval' + this.playerTwo.remainingOvals--
        // }
        // else if (!oval_slots) {
        //     random_slot = Math.floor(Math.random() * triangle_slots.length)
        //     slotID = triangle_slots[random_slot]
        //     piece = 'blackTriangle' + this.playerTwo.remainingTriangles--
        // }   
        
        // testing autoplay
        if (piece.indexOf('Oval') > -1) {
            let m = ["oval1425","oval1427","oval1429","oval1417","oval1419","oval1421"]
            for (var index=0; index<m.length; index++) {
                if (this.availableSlots.includes(m[index])) {
                    slotID = m[index]
                }
            }
        }
        else {
            let n = ["triangle190","triangle178","triangle180","triangle182","triangle184","triangle208"]
            for (var index=0; index<n.length; index++) {
                if (this.availableSlots.includes(n[index])) {
                    slotID = n[index]
                }
            }           
        }        

        // remove from available slots
        this.availableSlots = this.removeSlot(slotID)

        return JSON.stringify({ type: 'BROADCAST', 
                                event: 'STAGE_BOT', 
                                gameID: this.id, 
                                availableSlots: this.availableSlots,
                                gamePiece: piece,
                                slotID: slotID,
                                currentPlayer: 2 })

        //return { message: 'ok' }
    }

    compareSymbolArrays = function(symbol_slots, player_slots)  {
        // check player's slots against symbol slots
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
    
        // make sure it doesn't exist already
        //if (this._getGameIndex(id)) {
            // call function again to regenerate a new id
        //}
    
        return id
    }    

    _getRandomInt = function(min, max) {
        min = Math.ceil(min)
        max = Math.floor(max)

        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    // _pickOvalOrTri = function() {
    //     if (this._getRandomInt(1, 100) > 50) 
    //         return 'oval'

    //     return 'tri'
    // }



    // getBotsMove = function() {
    //     // randomly pick oval or triangle
    //     let random_slot = null
    //     let pickit = (Math.floor(Math.random() * 2) == 0)

    //     // let triangle_slots = this.availableSlots.filter(slot => slot.indexOf('triangle') > -1 )
    //     // let oval_slots = this.availableSlots.filter(slot => slot.indexOf('oval') > -1 ) 
        
    //     // determine available slots from the filledSlots array
    //     //let currently_available_slots = arrA.filter(x => !arrB.includes(x));

    //     if (pickit) {
    //         // triangle
    //         random_slot = Math.floor(Math.random() * this.triangle_slots.length);
    //     } 
    //     else {
    //         // oval
    //         random_slot = Math.floor(Math.random() * this.oval_slots.length);
    //     }

    //     return random_slot
    // }



  
}

