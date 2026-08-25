/**
 * pattern_index.js
 *
 * Builds a reverse index from a ScorePatterns object so that, given a single
 * slot ID that was just filled, we can instantly look up every symbol
 * pattern that slot participates in — instead of looping through all ~400
 * pattern instances on every single move.
 *
 * Index shape:
 *   {
 *     "oval1293": [ { symbol: "flower", index: 3, points: 25 }, ... ],
 *     "triangle120": [ { symbol: "diamond", index: 0, points: 5 }, ... ],
 *     ...
 *   }
 */

function buildPatternIndex(scorePatterns) {
    const index = {}

    Object.keys(scorePatterns).forEach(function (symbol) {
        const points = scorePatterns[symbol].points
        const groups = scorePatterns[symbol].symbol_slots

        groups.forEach(function (group, groupIndex) {
            group.forEach(function (slotID) {
                if (!index[slotID]) index[slotID] = []
                index[slotID].push({ symbol: symbol, index: groupIndex, points: points })
            })
        })
    })

    return index
}

module.exports = { buildPatternIndex }
