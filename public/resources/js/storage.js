/**
 *  IndexedDB storage for values that need to survive a browser refresh
 */

const DVC_DB_NAME = 'dvc'
const DVC_DB_VERSION = 1
const DVC_STORE = 'player'
const DVC_PLAYER_NAME_KEY = 'playerName'

function openPlayerDB() {
    return new Promise(function (resolve, reject) {
        if (!window.indexedDB) {
            reject(new Error('IndexedDB is not available'))
            return
        }

        const request = window.indexedDB.open(DVC_DB_NAME, DVC_DB_VERSION)

        request.onupgradeneeded = function () {
            if (!request.result.objectStoreNames.contains(DVC_STORE)) {
                request.result.createObjectStore(DVC_STORE)
            }
        }

        request.onsuccess = function () { resolve(request.result) }
        request.onerror = function () { reject(request.error) }
    })
}

function withStore(mode, work) {
    return openPlayerDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            const tx = db.transaction(DVC_STORE, mode)
            const result = work(tx.objectStore(DVC_STORE))

            tx.oncomplete = function () {
                db.close()
                resolve(result ? result.result : undefined)
            }
            tx.onerror = function () {
                db.close()
                reject(tx.error)
            }
        })
    })
}

// ****************************************************************
// persist the generated name so this browser keeps the same identity
function savePlayerName(name) {
    if (!name) return Promise.resolve(null)

    return withStore('readwrite', function (store) {
        store.put({ name: name, updated: Date.now() }, DVC_PLAYER_NAME_KEY)
    })
    .then(function () { return name })
    .catch(function (err) {
        console.warn('Unable to store player name: ' + err.message)
        return null
    })
}

// ****************************************************************
function loadPlayerName() {
    return withStore('readonly', function (store) {
        return store.get(DVC_PLAYER_NAME_KEY)
    })
    .then(function (record) { return record ? record.name : null })
    .catch(function (err) {
        console.warn('Unable to read player name: ' + err.message)
        return null
    })
}
