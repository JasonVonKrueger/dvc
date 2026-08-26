/* ************************************************************************************
    @desc - generates the display name used as a player's id
************************************************************************************ */
const { uniqueNamesGenerator, adjectives, colors, animals } = require('unique-names-generator')
const { db } = require('./db')

const MAX_ATTEMPTS = 25

const nameTaken = db.prepare('SELECT 1 FROM players WHERE id = ?')

function buildName() {
    return uniqueNamesGenerator({
        dictionaries: [adjectives, colors, animals],
        separator: ' ',
        style: 'capital'
    })
}

// reserved: names handed out in this same request that aren't in the db yet
function generatePlayerName(reserved) {
    let claimed = reserved || []

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        let name = buildName()

        try {
            if (!claimed.includes(name) && !nameTaken.get(name)) {
                return name
            }
        }
        catch (err) {
            console.error('DB ERROR <<< generatePlayerName: ' + err.message)
            return name
        }
    }

    return buildName() + ' ' + Date.now().toString(36).toUpperCase()
}

module.exports = { generatePlayerName }
