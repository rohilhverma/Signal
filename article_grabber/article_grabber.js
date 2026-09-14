import * as cheerio from 'cheerio'
import axios from 'axios'
import { chromium } from 'playwright'
import pLimit from 'p-limit'
import pg from 'pg'
import { summarize, batchSize } from './summarizer.js'
import "dotenv/config"

const { Pool } = pg

// Connection settings come from DATABASE_URL if present, otherwise discrete
// PG* vars, otherwise local defaults.
const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.PGHOST || 'localhost',
            port: Number(process.env.PGPORT || 5432),
            database: process.env.PGDATABASE || 'postgres',
            user: process.env.PGUSER || 'rohilverma',
            password: process.env.PGPASSWORD,
        }
)
pool.on('error', (err) => console.error('Postgres pool error:', err.message))

export { pool }

// Only ever launch this many headless browsers at once, no matter how many
// requests are in flight.
const browserLimit = pLimit(Number(process.env.BROWSER_CONCURRENCY || 3))

const cutoffMs = 24 * 60 * 60 * 1000
// Hardcoded allowlist: content mode -> summary column. Column names are NEVER
// taken from user input, only looked up here.
const SUMMARY_COLUMNS = {
    "shorter": "summary_short",
    "default": "summary_default",
    "longer": "summary_long"
}
function summaryColumn(mode) {
    const column = SUMMARY_COLUMNS[mode]
    if (!column) { throw new Error(`Unknown content mode: ${mode}`) }
    return column
}
const nonTechPatterns = [
    // --- deal / sale keywords ---
    /\bdeals?\b/i,
    /\bon sale\b/i,
    /\b(flash|big|huge|summer|winter|spring|fall|holiday|seasonal|mega|clearance) sale\b/i,
    /\bsale (alert|ends?|event|extravaganza)\b/i,
    /\bdiscount(s|ed)?\b/i,
    /\bclearance\b/i,
    /\brebate\b/i,
    /\bsavings?\b/i,
    /\bmarkdown\b/i,
    /\bsteals?\b/i,
    /\bcoupon\b/i,
    /\bpromo code\b/i,
    /\bprice drop\b/i,
    /\bprice cut\b/i,
    /\bprime day\b/i,
    /\bblack friday\b/i,
    /\bcyber monday\b/i,
    /\bgift guide\b/i,
    /\bgift ideas?\b/i,
    /\bshopping guide\b/i,
    /\bhow to save\b/i,
    /\bunder \$\d+\b/i,
    /\blast chance\b/i,
    /\blimited time\b/i,
    // --- shopping roundups / listicles ---
    /^best\b/i,
    /^the best\b/i,
    /^(the )?\d+\s+best\b/i,
    /\bbest .{0,60} (of|for|in|under) \b/i,
    /\btop \d+\b/i,
    /\b\d+ (best|top|great|cheap|affordable)\b/i,
    /\bwe (tested|tried|reviewed|ranked|compared)\b/i,
    /\b(buying|shoppers?'?) guide\b/i,
    /\b(our|editor'?s?) (picks?|choice|favorites?|recommendations?)\b/i,
    /\bshould you (buy|upgrade|get)\b/i,
    /\bworth (buying|it|the (money|upgrade))\b/i,
    /\bvs\.? .{0,40}: which\b/i,
    /\b(cheapest|most affordable|best value)\b/i,
    /\bright now\b/i,
]

const podcastPatterns = [
    /\bon this episode\b/i,
    /\bin this episode\b/i,
    /\blisten to (the |this )?(full )?episode\b/i,
    /\bthis week('s)? episode\b/i,
    /\bsubscribe (wherever|on) (you get|apple|spotify|google)/i,
    /\bavailable on (apple podcasts?|spotify|google podcasts?|stitcher)\b/i,
    /\bfollow (us |the show )?on (apple podcasts?|spotify)\b/i,
    /\bpodcast transcript\b/i,
    /\bepisode transcript\b/i,
    /\bshow notes\b/i,
    /\bjoin (us|me) (as|for|while)\b/i,
    /\bour guest (today|this week|this episode)\b/i,
    /\bthis episode('s| is about| features| covers)\b/i,
]

const paywallIndicators = [
    '.paywall',
    '#paywall',
    '.subscription-required',
    '.meter-limit',
    '.locked-content',
    '[data-paywall]',
    '.regwall',
    '#regwall',
];

const paywallPhrases = [
    /subscribe to continue reading/i,
    /subscribe to read (the full|this)/i,
    /this (article|story|content) is (for|available to) (subscribers|members)/i,
    /you('ve| have) reached your (free )?(article|story) limit/i,
    /get unlimited access/i,
    /create a free account to continue/i,
    /sign in to continue reading/i,
    /already a subscriber\? sign in/i,
    /member-only (content|article|story)/i,
    /exclusive(ly)? for (subscribers|members)/i,
];


// Returns the site_feeds row for a host, or null.
async function dbGet(websiteUrl) {
    const { rows } = await pool.query(
        'SELECT website_url, rss_url, site_name, paywall FROM site_feeds WHERE website_url = $1',
        [websiteUrl]
    )
    return rows[0] || null
}

// Upsert the cached RSS URL for a host without disturbing site_name / paywall.
async function dbPut(websiteUrl, rssUrl) {
    return pool.query(
        `INSERT INTO site_feeds (website_url, rss_url)
         VALUES ($1, $2)
         ON CONFLICT (website_url) DO UPDATE SET rss_url = EXCLUDED.rss_url`,
        [websiteUrl, rssUrl]
    )
}

async function dbSiteName(websiteUrl, siteName) {
    return pool.query(
        `INSERT INTO site_feeds (website_url, site_name)
         VALUES ($1, $2)
         ON CONFLICT (website_url) DO UPDATE SET site_name = EXCLUDED.site_name`,
        [websiteUrl, siteName]
    )
}

async function dbGUID(guid){
    return pool.query(
        `INSERT INTO seen_guids (guid, processed_at)
         VALUES ($1, $2)
         ON CONFLICT (guid) DO UPDATE SET processed_at = EXCLUDED.processed_at`,
        [String(guid), new Date()]
    )
}

async function guidChecker(guid){
    const { rows } = await pool.query('SELECT 1 FROM seen_guids WHERE guid = $1', [String(guid)])
    return rows.length > 0
}

// Upsert one article. Only the summary column for THIS mode is ever written —
// the other two slots are left untouched so a user-requested resummarization
// is never wiped by a later scrape. `topics` is not mode-specific, so unlike
// the summary columns it is unconditionally overwritten on every upsert, same
// as title/article_text/word_count/etc.
async function newArticle(item, summary, mode, topics){
    const column = summaryColumn(mode)
    // toTopics() in summarizer.js always returns an array (possibly empty),
    // but stay defensive here in case a caller ever passes undefined directly.
    const topicsStr = Array.isArray(topics) ? topics.join(',') : ''
    const sql = `
        INSERT INTO articles
            (website_url, link, title, ${column}, article_text, word_count, published_at, processed_at, paywall, topics)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT ON CONSTRAINT uk_articles_site_link DO UPDATE SET
            title = EXCLUDED.title,
            ${column} = EXCLUDED.${column},
            article_text = EXCLUDED.article_text,
            word_count = EXCLUDED.word_count,
            published_at = EXCLUDED.published_at,
            processed_at = EXCLUDED.processed_at,
            paywall = EXCLUDED.paywall,
            topics = EXCLUDED.topics`
    return pool.query(sql, [
        item.websiteName,
        item.link,
        item.title_,
        summary,
        item.articleText,
        item.articleText.trim().split(/\s+/).length,
        item.publishedAt,
        new Date(),
        item.paywall,
        topicsStr
    ])
}

async function flagRSSPaywall(websiteUrl){
    return pool.query(
        `INSERT INTO site_feeds (website_url, paywall)
         VALUES ($1, TRUE)
         ON CONFLICT (website_url) DO UPDATE SET paywall = TRUE`,
        [websiteUrl]
    )
}

// Rewrite a single summary slot on an existing article, leaving the others alone.
async function updateSummary(item, summary, mode){
    const column = summaryColumn(mode)
    return pool.query(
        `UPDATE articles SET ${column} = $1 WHERE website_url = $2 AND link = $3`,
        [summary, item.websiteName, item.link]
    )
}

const rssPaths = [
        'feed',
        'rss.xml',
        'rss/index.xml',
        'index.xml',
        'feed.xml',
        'rss',
        'atom.xml'
    ]

const formats = {
    "rss": {
        itemSelector: 'item',
        title: 'title',
        link: 'link',
        guid: 'guid',
        date: 'pubDate',
        websiteTitle: 'channel > title' 
    },
    "atom": {
        itemSelector: 'entry',
        title: 'title',
        link: 'link', 
        guid: 'id',
        date: 'published',
        websiteTitle: 'feed > title'
    }
};

function decodeHtmlEntities(str) {
    return str
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim()
}

const axiosConfig = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    timeout: 5000
};

// Thrown when no RSS feed could be located for a site — the caller maps this
// to a 502 rather than a generic 500.
export class FeedNotFoundError extends Error {
    constructor(url) {
        super(`Couldn't grab RSS feed for ${url}`)
        this.name = 'FeedNotFoundError'
    }
}

export async function initialScraper(url, mode = "default") {
    if (!SUMMARY_COLUMNS[mode]) { throw new Error(`Unknown content mode: ${mode}`) }
    const cleanURL = new URL(url)
    const cutoff = new Date(Date.now() - cutoffMs)
    const data = await linkBuilder(cleanURL)
    if (!data){
        console.log("Couldn't grab RSS feed")
        throw new FeedNotFoundError(url)
    }
    const $ = cheerio.load(data, {xmlMode:true})
    let format = 'rss'
    if ($('feed').length){format = 'atom'}
    else if ($('rss').length){format = 'rss'}
    
    const items = $(formats[format].itemSelector).toArray()
    console.log(`--- DEBUG: FOUND ${items.length} ARTICLES --- \n`);
    let webName = null
    try {
        const homeResp = await axios.get(cleanURL.origin, axiosConfig)
        const $home = cheerio.load(homeResp.data)
        webName = $home('meta[property="og:site_name"]').attr('content')?.trim() || null
    } catch(e) {}
    if (!webName) {
        const rssTitle = $(formats[format].websiteTitle).text().trim()
        webName = (rssTitle && rssTitle.length <= 40) ? rssTitle : cleanURL.hostname.replace('www.', '')
    }
    await dbSiteName(cleanURL.host, webName)
    let existingCount=0
    let newCount=0
    let scrapedCount=0
    let paywallCount=0
    let articleList=[]
    for (const element of items) {
        const guid = $(element).find(formats[format].guid).text()
        const exists = await guidChecker(guid)
        if (exists){
            existingCount+=1
            console.log(`GUID exists, skipping: ${guid}`)
            continue
        }
        let date = $(element).find(formats[format].date).text()
        if (!date) {date = $(element).find('pubDate').text() || 
                $(element).find('published').text() || 
                $(element).find('updated').text() || 
                $(element).find('dc\\:date').text() ||
                $(element).find('pubdate').text() ||
                $(element).find('date').text() ||
                $(element).find('created').text();
        }
        const articleDate = new Date(date)
        console.log(articleDate)
        const title = decodeHtmlEntities($(element).find(formats[format].title).text())
        if (articleDate < cutoff){console.log(`${title}: Too old, Skipping`); continue}
        if (nonTechPatterns.some(p => p.test(title))){console.log(`${title}: Non-tech, Skipping`); continue}
        let link = $(element).find('link').text()
        if(!link){link = $(element).find(formats[format].link).attr('href')}
        if (!link){continue}
        let parsedLink
        try { parsedLink = new URL(link) } catch { console.log(`Invalid URL, skipping: ${link}`); continue }
        if (parsedLink.protocol !== 'http:' && parsedLink.protocol !== 'https:') { console.log(`Non-http URL, skipping: ${link}`); continue }
        if (/^\/(gallery|review|reviews|guide|collection|buying-guide|roundup)\//i.test(parsedLink.pathname)) { console.log(`Product guide URL, skipping: ${link}`); continue }
        const articleTextAndTime = await scrapeArticles(link)
        const textLen = articleTextAndTime.articleText?.trim().length ?? 0
        const minChars = articleTextAndTime.paywallStatus ? 1500 : 500
        if (!articleTextAndTime.articleText || textLen < minChars) {
            if (articleTextAndTime.paywallStatus) {
                console.log(`Paywall article with insufficient text (${textLen} chars), GUID saved: ${link}`)
                await dbGUID(guid)
                paywallCount+=1
            } else {
                console.log(`Empty or too-short article text, skipping entirely: ${link}`)
            }
            continue
        }
        if (podcastPatterns.some(p => p.test(articleTextAndTime.articleText))) {
            console.log(`${title}: Podcast content, skipping`)
            continue
        }
        if (articleTextAndTime.paywallStatus) {
            paywallCount+=1
            console.log(`Paywall article saved with flag (${textLen} chars): ${link}`)
        }
        const articleContent = {
            websiteName: cleanURL.host,
            link: link,
            guid_: guid,
            title_:title,
            articleText: articleTextAndTime.articleText,
            publishedAt: date ? new Date(date).toISOString() : null,
            processedAt: new Date().toISOString(),
            paywall: articleTextAndTime.paywallStatus
        }
        scrapedCount+=1
        console.log(articleContent)
        articleList.push(articleContent)
    }
    const totalProcessed = scrapedCount + paywallCount
    console.log(`Paywall: ${paywallCount}/${totalProcessed} articles`)
    let sitePaywalled = false
    if (totalProcessed > 0 && paywallCount / totalProcessed >= 0.7) {
        console.log(`70%+ paywall rate detected for ${url}, flagging RSS row`)
        await flagRSSPaywall(cleanURL.host)
        sitePaywalled = true
    }
    const chunkSize = batchSize()
    for (let i = 0 ; i < articleList.length; i += chunkSize){
        const chunk = articleList.slice(i, i + chunkSize)
        const chunkIndex = Math.floor(i / chunkSize) + 1
        console.log(`\n--- CHUNK ${chunkIndex}: Sending ${chunk.length} articles to the summarizer ---`)
        chunk.forEach((a, idx) => console.log(`  [${idx}] ${a.title_}`))

        let summarization = null
        try {
            summarization = await summarize(chunk, mode)
            console.log(`Summarizer returned ${summarization.length} summaries for ${chunk.length} articles`)
            if (summarization.length !== chunk.length) {
                console.warn(`--- MISMATCH: expected ${chunk.length}, got ${summarization.length} ---`)
            }
        } catch (summarizeErr) {
            console.error(`Summarizer failed for chunk ${chunkIndex}:`, summarizeErr.message)
            continue
        }

        for (let j = 0; j < chunk.length; j++) {
            if (summarization[j]) {
                try {
                    await dbGUID(chunk[j].guid_)
                    await newArticle(chunk[j], summarization[j].summary, mode, summarization[j].topics)
                    newCount+=1
                    console.log(`  [${j}] Saved article with summary: ${chunk[j].title_}`)
                } catch (saveErr) {
                    console.error(`  [${j}] DB save FAILED for "${chunk[j].title_}":`, saveErr.message)
                }
            } else {
                console.warn(`  [${j}] No summary from Gemini for: ${chunk[j].title_}, skipping DB save`)
            }
        }
    }
    console.log({website_:url,
                newArticles_: newCount,
                existingArticles_: existingCount
    })
    if (!sitePaywalled) {
        // A site flagged as paywalled on an earlier run stays flagged.
        const feed = await dbGet(cleanURL.host)
        sitePaywalled = feed?.paywall === true
    }
    return {
        website: url,
        articlesAdded: newCount,
        paywalled: sitePaywalled,
        existingArticles: existingCount
    }
}

async function scrapeArticles(url) {
    const sourceURL = new URL(url)
    let data = null
    try {
        const response = await axios.get(sourceURL.href)
        data = response.data
    } catch (error) {
        if (error.response && (error.response.status === 429 || error.response.status === 403)) {
            data = await javascriptHTMLScraper(sourceURL.href)
        } else {
            console.log(`Failed to scrape ${url}: ${error.message}`)
            return { articleText: null, publishDate: null, paywallStatus: false }
        }
    }
    if (!data) {
        return { articleText: null, publishDate: null, paywallStatus: false }
    }
    const $ = cheerio.load(data)
    let paywallStatus = false
    const paywallBySelector = paywallIndicators.some(selector => $(selector).length > 0)
    const articleBodyText = $(".entry-content, .c-entry-content, article, .article-body, .story-content, main").first().text()
    const paywallByPhrase = paywallPhrases.some(p => p.test(articleBodyText))
    if (paywallBySelector || paywallByPhrase) {
        console.log(`Paywall Detected! (${paywallBySelector ? 'selector' : 'phrase'})`)
        paywallStatus = true
    }
    $(
        '.c-entry-sidebar, ' +
        '.c-byline, ' +
        '.c-entry-summary, ' +
        '.c-newsletter-signup, ' +
        'aside, ' +
        '.native-ad, ' +
        '.featured-image-caption'
    ).remove()
    const publishDate =
        $('time').attr('datetime') ||
        $('meta[property="article:published_time"]').attr('content') ||
        $('meta[name="pubdate"]').attr('content') ||
        $('meta[name="date"]').attr('content') ||
        null
    const articleText = $(".entry-content p, .c-entry-content p, article p, .article-body p, .story-content p, .content__body p, #content--body p, .article-content p, main p")
        .map((_, element) => $(element).text())
        .get()
        .filter(text => text.length > 0)
        .join('\n\n')
        .trim()
    return { articleText, publishDate, paywallStatus }
}

async function linkBuilder(url) {
    const baseUrl = url.origin
    const pk = url.host

    const cached = await dbGet(pk)
    if (cached && cached.rss_url) {
        try {
            const response = await axios.get(cached.rss_url, axiosConfig)
            console.log("RSS Feed Found, Using")
            return response.data
        } catch(err){
            const xmlData = await javascriptBypasser(cached.rss_url)
            if (xmlData){ return xmlData }
            else { return null }
        }
    }
    for (const link of rssPaths){
        const testURL = baseUrl + '/' + link
        let feedData = null
        try {
            const response = await axios.get(testURL, axiosConfig)
            console.log(`RSS Caught: ${testURL}`)
            feedData = response.data
        } catch(err) {
            if (err.response && (err.response.status === 429 || err.response.status === 403 || err.response.status === 503)) {
                console.log(`Failed ${testURL}`)
                feedData = await javascriptBypasser(testURL)
                if (!feedData){ console.log(`Feed fetch failed for ${testURL}`); continue }
            } else {
                continue
            }
        }
        try {
            await dbPut(pk, testURL)
        } catch(err) {
            console.log(`Postgres site_feeds upsert failed: ${err.message}`)
        }
        return feedData
    }
    return null
}

// Fallback path only (429 / 403 / 503). Every launch goes through browserLimit
// so simultaneous blocked sites can't spawn unbounded Chromium processes.
async function javascriptBypasser(url){
    return browserLimit(async () => {
        const browser = await chromium.launch({ headless: true })
        const page = await browser.newPage()
        try {
            const baseUrl = new URL(url).origin
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
            await page.waitForSelector('header', { timeout: 15000 })
            const rawXML = await page.evaluate(async (feedUrl) => {
                const res = await fetch(feedUrl)
                return await res.text()
            }, url)
            return rawXML
        } catch(error){
            console.log(`Playwright failed of ${url}:${error.message}`)
            return null
        } finally {
            await browser.close()
        }
    })
}

async function javascriptHTMLScraper(url){
    return browserLimit(async () => {
        const browser = await chromium.launch({ headless: true })
        const page = await browser.newPage()
        try {
            console.log(`Playwright is trying to grab Article HTML: ${url}`)
            await page.goto(url, { waitUntil: 'domcontentloaded' })
            await page.waitForSelector('.entry-content, .c-entry-content, .article-body, article', { timeout: 10000 });
            const rawHTML = await page.content()
            return rawHTML
        } catch(error){
            console.log(`Playwright couldn't grab the article HTML ${url}`)
            return null
        } finally {
            await browser.close()
        }
    })
}
