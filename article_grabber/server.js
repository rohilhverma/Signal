import http from 'node:http'
import "dotenv/config"
import { initialScraper, FeedNotFoundError, pool } from './article_grabber.js'

const PORT = Number(process.env.SCRAPER_PORT || 4000)
const VALID_MODES = new Set(['shorter', 'default', 'longer'])
const MAX_BODY_BYTES = 1_000_000

function sendJSON(res, status, payload) {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
    })
    res.end(body)
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        req.on('data', (chunk) => {
            size += chunk.length
            if (size > MAX_BODY_BYTES) {
                reject(new Error('Request body too large'))
                req.destroy()
                return
            }
            chunks.push(chunk)
        })
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        req.on('error', reject)
    })
}

async function handleScrape(req, res) {
    // `website` is echoed back on every response, so pull it out before anything
    // that can throw.
    let website = null
    try {
        const raw = await readBody(req)
        let body
        try {
            body = JSON.parse(raw || '{}')
        } catch {
            return sendJSON(res, 400, { website: null, error: 'Body is not valid JSON' })
        }

        if (!body.website || typeof body.website !== 'string') {
            return sendJSON(res, 400, { website: body.website ?? null, error: '"website" is required' })
        }
        website = /^https?:\/\//i.test(body.website) ? body.website : `https://${body.website}`

        if (!body.username || typeof body.username !== 'string') {
            return sendJSON(res, 400, { website, error: '"username" is required' })
        }

        const mode = body.mode === undefined || body.mode === null ? 'default' : body.mode
        if (!VALID_MODES.has(mode)) {
            return sendJSON(res, 400, { website, error: `"mode" must be one of shorter, default, longer` })
        }

        try {
            new URL(website)
        } catch {
            return sendJSON(res, 400, { website, error: 'Invalid website URL' })
        }

        console.log(`[scrape] user=${body.username} website=${website} mode=${mode}`)
        const result = await initialScraper(website, mode)

        return sendJSON(res, 200, {
            website,
            articlesAdded: result.articlesAdded,
            paywalled: result.paywalled
        })
    } catch (err) {
        // One failing site must never take the process down — SQS used to give
        // this isolation via separate Lambda invocations.
        console.error(`[scrape] failed for ${website}:`, err?.stack || err?.message || err)
        const status = err instanceof FeedNotFoundError ? 502 : 500
        return sendJSON(res, status, { website, error: err?.message || 'Scrape failed' })
    }
}

const server = http.createServer((req, res) => {
    const path = (req.url || '').split('?')[0]

    if (req.method === 'GET' && path === '/health') {
        return sendJSON(res, 200, { status: 'ok' })
    }
    if (req.method === 'POST' && path === '/scrape') {
        // Not awaited: requests are handled concurrently, and handleScrape
        // never rejects.
        handleScrape(req, res)
        return
    }
    return sendJSON(res, 404, { website: null, error: 'Not found' })
})

// A thrown-away socket or a late write must not kill the process either.
server.on('clientError', (err, socket) => {
    console.error('[server] client error:', err.message)
    if (socket.writable) { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n') }
})
process.on('unhandledRejection', (err) => {
    console.error('[server] unhandled rejection:', err?.stack || err)
})

server.listen(PORT, () => {
    console.log(`article_grabber listening on http://localhost:${PORT}`)
})

async function shutdown(signal) {
    console.log(`\n${signal} received, shutting down`)
    server.close(() => {
        pool.end().finally(() => process.exit(0))
    })
    setTimeout(() => process.exit(0), 10000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
