/**
 *  Internal-only GitHub webhook listener that redeploys the app on push to main.
 *  Bind to 127.0.0.1 and reverse-proxy it through Nginx - never expose it directly.
 *  Run as its own pm2 process, separate from the game server.
 */
"use strict"

const crypto = require('crypto')
const path = require('path')
const { execFile } = require('child_process')
const express = require('express')

const app = express()
const PORT = process.env.DEPLOY_WEBHOOK_PORT || 9130
const SECRET = process.env.DEPLOY_WEBHOOK_SECRET
const DEPLOY_BRANCH = 'refs/heads/main'
const DEPLOY_SCRIPT = path.join(__dirname, 'deploy.sh')

if (!SECRET) {
    console.error('DEPLOY_WEBHOOK_SECRET is not set - refusing to start')
    process.exit(1)
}

// raw body is required so the HMAC signature can be verified against the exact bytes GitHub signed
app.use(express.raw({ type: 'application/json' }))

app.post('/deploy-webhook', function (req, res) {
    const signature = req.headers['x-hub-signature-256'] || ''
    const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(req.body).digest('hex')

    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expected)

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return res.status(401).send('bad signature')
    }

    let payload
    try {
        payload = JSON.parse(req.body.toString('utf8'))
    } catch (err) {
        return res.status(400).send('bad payload')
    }

    if (req.headers['x-github-event'] !== 'push' || payload.ref !== DEPLOY_BRANCH) {
        return res.status(200).send('ignored (not a push to main)')
    }

    res.status(202).send('deploying')
    console.log(`[deploy] triggered by ${payload.pusher && payload.pusher.name} at ${new Date().toISOString()}`)

    // detach so a pm2 restart of this listener (if it's ever redeployed too) doesn't kill the deploy mid-flight
    const child = execFile('bash', [DEPLOY_SCRIPT], function (err, stdout, stderr) {
        if (err) console.error('[deploy] failed:', err.message)
        if (stdout) console.log(stdout)
        if (stderr) console.error(stderr)
    })
    child.unref()
})

app.listen(PORT, '127.0.0.1', function () {
    console.log(`Deploy webhook listening on 127.0.0.1:${PORT}`)
})
