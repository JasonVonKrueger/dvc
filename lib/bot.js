/**
 * bot.js
 *
 * Heuristic single-player bot for Da Vinci's Challenge.
 *
 * Priority order for each move:
 *   1. WIN NOW   - take any available slot that completes one or more of
 *                  the bot's own patterns immediately. If several slots
 *                  would score, take the one worth the most points.
 *   2. BLOCK     - take any available slot the opponent needs as the LAST
 *                  piece of one of their patterns, denying it to them
 *                  forever (a slot can only ever hold one player's piece).
 *   3. BUILD     - take the available slot that most advances the bot's
 *                  own still-completable patterns, weighted toward
 *                  patterns that are already close to done and worth more
 *                  points.
 *   4. FALLBACK  - nothing is in progress yet (e.g. the opening move) --
 *                  take the slot involved in the most still-completable
 *                  patterns, to keep the most future options open.
 *
 * A pattern is "alive" for a player only if none of its slots have
 * already been taken by the OTHER player -- once the enemy holds even one
 * slot in a group, that group can never be completed by you.
 *
 * This module only DECIDES the move (slotID + piece type). It does not
 * mutate game state, push to slots arrays, or apply scoring -- that still
 * happens in the normal MOVE_COMPLETE flow, exactly like a human move.
 */

let ScorePatterns = require('./score_patterns.json')

function buildBotMove(game, botPlayerKey) {
    const opponentKey = botPlayerKey === 'playerOne' ? 'playerTwo' : 'playerOne'
    const bot = game[botPlayerKey]
    const opponent = game[opponentKey]

    const botSlots = new Set(bot.slots)
    const opponentSlots = new Set(opponent.slots)

    function canPlace(slotID) {
        if (!game.availableSlots.includes(slotID)) return false
        if (slotID.startsWith('oval')) return bot.remainingOvals > 0
        if (slotID.startsWith('triangle')) return bot.remainingTriangles > 0
        return false
    }

    function pieceTypeFor(slotID) {
        return slotID.startsWith('oval') ? 'oval' : 'triangle'
    }

    // every still-completable pattern for a given player: not yet claimed,
    // and no slot in the group already belongs to the other player
    function liveOpportunities(ownSlots, enemySlots) {
        const opportunities = []

        Object.keys(ScorePatterns).forEach(function (symbol) {
            const points = ScorePatterns[symbol].points
            const groups = ScorePatterns[symbol].symbol_slots

            groups.forEach(function (group, index) {
                if (game.claimedPatterns[symbol].has(index)) return

                let dead = false
                let filledCount = 0
                let missing = []

                group.forEach(function (slotID) {
                    if (enemySlots.has(slotID)) {
                        dead = true
                    } else if (ownSlots.has(slotID)) {
                        filledCount++
                    } else {
                        missing.push(slotID)
                    }
                })

                if (!dead) {
                    opportunities.push({ symbol, index, points, group, missing, filledCount })
                }
            })
        })

        return opportunities
    }

    function pickBest(scoreMap) {
        let best = null
        let bestScore = -Infinity
        Object.keys(scoreMap).forEach(function (slotID) {
            if (scoreMap[slotID] > bestScore) {
                bestScore = scoreMap[slotID]
                best = slotID
            }
        })
        return best
    }

    const botOpportunities = liveOpportunities(botSlots, opponentSlots)
    const opponentOpportunities = liveOpportunities(opponentSlots, botSlots)

    // ---------------- Priority 1: WIN NOW ----------------
    const winScores = {}
    botOpportunities.forEach(function (opp) {
        if (opp.missing.length === 1 && canPlace(opp.missing[0])) {
            const slotID = opp.missing[0]
            winScores[slotID] = (winScores[slotID] || 0) + opp.points
        }
    })
    const bestWin = pickBest(winScores)
    if (bestWin) {
        return { slotID: bestWin, pieceType: pieceTypeFor(bestWin), reason: 'WIN' }
    }

    // ---------------- Priority 2: BLOCK ----------------
    const blockScores = {}
    opponentOpportunities.forEach(function (opp) {
        if (opp.missing.length === 1 && canPlace(opp.missing[0])) {
            const slotID = opp.missing[0]
            blockScores[slotID] = (blockScores[slotID] || 0) + opp.points
        }
    })
    const bestBlock = pickBest(blockScores)
    if (bestBlock) {
        return { slotID: bestBlock, pieceType: pieceTypeFor(bestBlock), reason: 'BLOCK' }
    }

    // ---------------- Priority 3: BUILD ----------------
    const buildScores = {}

    // patterns already in progress: weight heavily toward near-completion
    botOpportunities.forEach(function (opp) {
        if (opp.filledCount === 0) return
        const progressWeight = (opp.filledCount + 1) / opp.group.length
        opp.missing.forEach(function (slotID) {
            if (!canPlace(slotID)) return
            buildScores[slotID] = (buildScores[slotID] || 0) + opp.points * progressWeight
        })
    })

    // patterns not started yet: small weight, just enough to break ties
    // and give the bot direction before it has any pieces down
    botOpportunities.forEach(function (opp) {
        if (opp.filledCount !== 0) return
        opp.missing.forEach(function (slotID) {
            if (!canPlace(slotID)) return
            buildScores[slotID] = (buildScores[slotID] || 0) + opp.points * 0.15
        })
    })

    const bestBuild = pickBest(buildScores)
    if (bestBuild) {
        return { slotID: bestBuild, pieceType: pieceTypeFor(bestBuild), reason: 'BUILD' }
    }

    // ---------------- Priority 4: FALLBACK ----------------
    const fallbackScores = {}
    game.availableSlots.forEach(function (slotID) {
        if (!canPlace(slotID)) return
        const involved = (game.patternIndex[slotID] || []).filter(function (p) {
            return !game.claimedPatterns[p.symbol].has(p.index)
        })
        fallbackScores[slotID] = involved.length
    })

    const bestFallback = pickBest(fallbackScores)
    if (bestFallback) {
        return { slotID: bestFallback, pieceType: pieceTypeFor(bestFallback), reason: 'FALLBACK' }
    }

    // last resort: literally anything placeable (should only happen at
    // the very end of the game when the board is nearly full)
    const anySlot = game.availableSlots.find(canPlace)
    return anySlot ? { slotID: anySlot, pieceType: pieceTypeFor(anySlot), reason: 'RANDOM' } : null
}

module.exports = { buildBotMove }