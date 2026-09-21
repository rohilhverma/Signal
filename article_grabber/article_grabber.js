import * as cheerio from 'cheerio'
import axios from 'axios'
import { chromium } from 'playwright-core'
import chromiumLambda from '@sparticuz/chromium'
import pLimit from 'p-limit'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { summarize, batchSize } from './summarizer.js'
// dotenv is only for running this file by hand; on Lambda the environment comes from the
// function configuration.
import "dotenv/config"

// ─── The store ───────────────────────────────────────────────────────────────
//
// One DynamoDB table, PK `websiteURLs`, SK one of:
//   "RSS"                 the site row (rss_url, siteName, paywall) - no TTL
//   "<article link>"      one article, TTL'd seven days after it was written
//   PK = <guid>, SK = "EXISTS"   the dedupe marker. Note the PK is the GUID, not the site, so
//                                these never turn up in a site query.
//
// `website` arrives in the SQS message already normalised by the API and is used verbatim as
// the partition key. That is deliberate. The previous version derived the key here as
// `new URL(url).host` while the API derived its own key with a different rule (it prepends
// `www.` to single-dot domains), so a site could be written under one key and read under
// another and nothing failed loudly — the feed was just empty for that source. One key, made
// once, on the side that owns it.

const TABLE = process.env.DYNAMODB_TABLE || 'MyScrapingHandlerTable'
const SITE_SK = 'RSS'
const EXISTS_SK = 'EXISTS'
const TTL_DAYS = 7

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

function ttlEpochSeconds() {
    return Math.floor(Date.now() / 1000) + TTL_DAYS * 24 * 60 * 60
}

// Only ever launch this many headless browsers at once, no matter how many articles are being
// fetched. A Lambda invocation handles a single site, so this bounds concurrency within it.
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


// ─── DynamoDB access ─────────────────────────────────────────────────────────

/** The site row for a host, or null if this site has never been scraped. */
async function dbGetSite(siteKey) {
    const { Item } = await dynamo.send(new GetCommand({
        TableName: TABLE,
        Key: { websiteURLs: siteKey, SK: SITE_SK }
    }))
    return Item || null
}

/** Caches the feed URL that worked, without disturbing siteName / paywall. */
async function dbPutRss(siteKey, rssUrl) {
    return dynamo.send(new UpdateCommand({
        TableName: TABLE,
        Key: { websiteURLs: siteKey, SK: SITE_SK },
        UpdateExpression: 'SET rss_url = :u',
        ExpressionAttributeValues: { ':u': rssUrl }
    }))
}

async function dbPutSiteName(siteKey, siteName) {
    return dynamo.send(new UpdateCommand({
        TableName: TABLE,
        Key: { websiteURLs: siteKey, SK: SITE_SK },
        UpdateExpression: 'SET siteName = :n',
        ExpressionAttributeValues: { ':n': siteName }
    }))
}

/**
 * Dedupe marker. Keyed by the GUID itself rather than by the site, so the same GUID appearing
 * on two sites never lets one suppress the other. TTL'd like the article: without that, a story
 * that resurfaces in a feed a week later would be dropped forever instead of re-summarized.
 */
async function markGuidSeen(guid) {
    return dynamo.send(new PutCommand({
        TableName: TABLE,
        Item: { websiteURLs: String(guid), SK: EXISTS_SK, ttl: ttlEpochSeconds() }
    }))
}

async function guidSeen(guid) {
    const { Item } = await dynamo.send(new GetCommand({
        TableName: TABLE,
        Key: { websiteURLs: String(guid), SK: EXISTS_SK }
    }))
    return Boolean(Item)
}

// ─── Article writes ──────────────────────────────────────────────────────────

/**
 * Writes one article, and touches nothing else on its item.
 *
 * <p>An UpdateItem rather than a PutItem, and that is the entire point: re-scraping a site
 * re-touches articles it has already summarized, and a Put replaces the item wholesale, blanking
 * the two summary depths it is not currently generating. UpdateItem sets exactly the attributes
 * named here — which is the behaviour the SQL `ON CONFLICT ... DO UPDATE SET` had to spell out one
 * column at a time.
 *
 * <p>The three depths are three separate attributes, not a three-slot list indexed by mode. A list
 * forces `SET summary[1] = :s`, which DynamoDB rejects outright when `summary` does not exist yet,
 * so a brand-new article could not be written in a single call. They also match the column names
 * the Postgres build used, the attribute names {@code summaryColumn()} already maps to, and the
 * field names the API sends — and they let the dashboard query project the deep dive away, since
 * it is several times the size of the other two combined.
 */
async function putArticle(item, summary, mode, topics) {
    const column = summaryColumn(mode)
    // toTopics() in summarizer.js always returns an array (possibly empty); stay defensive in
    // case a caller ever passes undefined directly.
    const tagList = Array.isArray(topics) ? topics : []

    return dynamo.send(new UpdateCommand({
        TableName: TABLE,
        Key: { websiteURLs: item.websiteName, SK: item.link },
        UpdateExpression:
            'SET title = :title, articleText = :text, word_count = :words, #d = :date, ' +
            'processedAt = :processed, paywall = :paywall, topics = :topics, #l = :link, ' +
            column + ' = :summary, #ttl = :ttl',
        // `date` and `ttl` are DynamoDB reserved words and must be aliased before use as attribute
        // names; `link` is aliased alongside them for consistency.
        ExpressionAttributeNames: { '#d': 'date', '#l': 'link', '#ttl': 'ttl' },
        ExpressionAttributeValues: {
            ':title': item.title_,
            ':text': item.articleText,
            ':words': item.articleText.trim().split(/\s+/).length,
            ':date': item.publishedAt,
            ':processed': new Date().toISOString(),
            ':paywall': item.paywall,
            ':topics': tagList,
            ':link': item.link,
            ':summary': summary,
            ':ttl': ttlEpochSeconds()
        }
    }))
}

async function flagSitePaywall(siteKey) {
    return dynamo.send(new UpdateCommand({
        TableName: TABLE,
        Key: { websiteURLs: siteKey, SK: SITE_SK },
        UpdateExpression: 'SET paywall = :p',
        ExpressionAttributeValues: { ':p': true }
    }))
}

/** Rewrite a single depth on an existing article, leaving the other two alone. */
async function updateSummary(item, summary, mode) {
    const column = summaryColumn(mode)
    return dynamo.send(new UpdateCommand({
        TableName: TABLE,
        Key: { websiteURLs: item.websiteName, SK: item.link },
        UpdateExpression: 'SET ' + column + ' = :summary',
        ExpressionAttributeValues: { ':summary': summary }
    }))
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

/**
 * Scrapes one site.
 *
 * `siteKey` is the partition key the API put in the SQS message, used verbatim and never
 * re-derived here — that identity between the write key and the read key is the point. The scheme
 * is assumed only for fetching, never for storing.
 */
export async function initialScraper(siteKey, mode = "default") {
    if (!SUMMARY_COLUMNS[mode]) { throw new Error(`Unknown content mode: ${mode}`) }
    const cleanURL = new URL(/^https?:\/\//i.test(siteKey) ? siteKey : `https://${siteKey}`)
    const cutoff = new Date(Date.now() - cutoffMs)
    const data = await linkBuilder(cleanURL, siteKey)
    if (!data){
        console.log("Couldn't grab RSS feed")
        throw new FeedNotFoundError(siteKey)
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
    await dbPutSiteName(siteKey, webName)
    let existingCount=0
    let newCount=0
    let scrapedCount=0
    let paywallCount=0
    let articleList=[]
    for (const element of items) {
        const guid = $(element).find(formats[format].guid).text()
        if (await guidSeen(guid)){
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
                await markGuidSeen(guid)
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
            websiteName: siteKey,
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
        console.log(`70%+ paywall rate detected for ${siteKey}, flagging site row`)
        await flagSitePaywall(siteKey)
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
                    await markGuidSeen(chunk[j].guid_)
                    await putArticle(chunk[j], summarization[j].summary, mode, summarization[j].topics)
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
    console.log({website_:siteKey,
                newArticles_: newCount,
                existingArticles_: existingCount
    })
    if (!sitePaywalled) {
        // A site flagged as paywalled on an earlier run stays flagged.
        const feed = await dbGetSite(siteKey)
        sitePaywalled = feed?.paywall === true
    }
    return {
        website: siteKey,
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

async function linkBuilder(url, siteKey) {
    const baseUrl = url.origin

    const cached = await dbGetSite(siteKey)
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
            await dbPutRss(siteKey, testURL)
        } catch(err) {
            console.log(`DynamoDB site-row update failed: ${err.message}`)
        }
        return feedData
    }
    return null
}

/**
 * @sparticuz/chromium ships a Chromium build sized for a Lambda package; playwright-core is
 * just the driver for it. Full `playwright` cannot be used here — it downloads its own browser
 * at install time, which does not survive into a deployment package.
 */
async function launchBrowser() {
    return chromium.launch({
        args: chromiumLambda.args,
        executablePath: await chromiumLambda.executablePath(),
        headless: true,
    })
}

// Fallback path only (429 / 403 / 503). Every launch goes through browserLimit
// so simultaneous blocked sites can't spawn unbounded Chromium processes.
async function javascriptBypasser(url){
    return browserLimit(async () => {
        const browser = await launchBrowser()
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
        const browser = await launchBrowser()
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

// ─── SQS entry point ─────────────────────────────────────────────────────────

/**
 * One SQS message per site: `{ username, website, mode }`, sent by the API's MessageSender.
 *
 * Exactly one record is expected, because the event-source mapping is configured with batch size
 * 1. Anything else is logged and skipped rather than guessed at.
 *
 * Throwing on failure is deliberate: the message has to fail so SQS redelivers it and the redrive
 * policy can eventually move it to the dead-letter queue. That is the retry behaviour the Postgres
 * queue implemented in application code with `5^attempts`-minute backoff, and a dead-letter queue
 * is what makes a permanently broken site visible instead of silently retried forever. Swallowing
 * the error would drop that site's refresh with nothing recorded. Nothing is waiting on a response
 * either way — the frontend polls the feed until the article count plateaus.
 */
export const handler = async (event) => {
    const records = event?.Records ?? []
    if (records.length !== 1) {
        console.warn(`Expected exactly 1 SQS record, got ${records.length} - nothing scraped`)
        return { scraped: 0 }
    }

    let body
    try {
        body = JSON.parse(records[0].body)
    } catch (err) {
        throw new Error(`SQS body is not valid JSON: ${err.message}`)
    }

    const { username, website, mode = 'default' } = body ?? {}
    if (!website || typeof website !== 'string') {
        throw new Error('SQS message is missing "website"')
    }

    console.log(`[scrape] user=${username} website=${website} mode=${mode}`)
    const result = await initialScraper(website, mode)
    console.log(`[scrape] done user=${username} website=${website} ` +
        `added=${result.articlesAdded} paywalled=${result.paywalled}`)
    return { scraped: 1, website, articlesAdded: result.articlesAdded }
}

