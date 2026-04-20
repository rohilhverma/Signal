import * as cheerio from 'cheerio'
import axios from 'axios'
import { chromium } from 'playwright-core'
import chromiumLambda from '@sparticuz/chromium'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { GoogleGenAI } from '@google/genai'
// import "dotenv/config"

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const ai = new GoogleGenAI({});
const TABLE = 'MyScrapingHandlerTable'
const SK = { RSS: 'RSS' }
const present = new Date()
const cutoff = new Date(present.getTime() - (36 * 60 * 60 * 1000))
const prompts={
    "shorter" : "You are a news wire editor. Summarize each article in 2-3 bullet points. Each bullet must be one sentence, maximum 20 words. Bullet 1: What happened — the core event, stated as a fact. Bullet 2: Who is involved and what specifically they did. Bullet 3 (only if needed): A key number or outcome that adds value. Rules: No filler phrases like \"it's worth noting\" or \"according to\"; No background or history unless critical to understanding the event; If a bullet doesn't add new information, cut it; Start each bullet with the subject, not a verb. Return ONLY a valid JSON array. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\".",
    "default" : "You are a news briefing editor. For each article, write a single paragraph summary of 4-6 sentences. Each summary must include: 1. The core event — what happened, stated directly; 2. Context — how this connects to related events or industry trends; 3. Implication — what this signals or why it matters going forward; 4. Key specifics — include relevant numbers, names, and concrete details. Write in a flowing paragraph, not bullet points. Do not use filler phrases. State facts directly with no editorializing. Return ONLY a valid JSON array. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\".",
    "longer": "You are a senior analyst writing intelligence briefings. For each article, you MUST write exactly 3 paragraphs separated by blank lines. No more, no fewer.\n\nParagraph 1 — What happened: who was involved, concrete specifics, relevant numbers, names, dates, and technical details from the article.\n\nParagraph 2 — Context: how this event connects to related developments, competing efforts, or previous events. Draw only from information within the article. If the article provides little context, connect the facts and details stated in paragraph 1.\n\nParagraph 3 — Implications: what this signals going forward, based only on what the article states or directly implies. If implications are not explicit, derive them logically from the facts in paragraph 1.\n\nRules:\n- Output MUST be exactly 3 paragraphs separated by blank lines\n- No labels, headers, or markers before paragraphs\n- No filler phrases or editorializing\n- Never introduce outside knowledge\n- Every sentence must be traceable to the article text\n\nReturn ONLY a valid JSON array. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\"."
}
const promptIndex={"shorter":0,"default":1,"longer":2}
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


async function dbGet(pk, sk) {
    return dynamo.send(new GetCommand({ TableName: TABLE, Key: { websiteURLs: pk, SK: sk } }))
}

async function dbPut(item) {
    return dynamo.send(new PutCommand({ TableName: TABLE, Item: item }))
}

async function dbGUID(item){
    const week = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

    return dynamo.send(new PutCommand({
        TableName: TABLE,
        Item: {
            websiteURLs: `${item}`,
            SK: "EXISTS",
            processedAt: new Date().toISOString(),
            ttl:week
        }
    }))
}

async function guidChecker(guid){
    return dynamo.send(new GetCommand({TableName: TABLE, Key: {websiteURLs: guid, SK: "EXISTS"}}))
}

async function newArticle(item, summary, mode){
    const week = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
    const summaryArr = ["", "", ""];
    summaryArr[promptIndex[mode]] = summary;

    return dynamo.send(new PutCommand({
        TableName: TABLE,
        Item: {
            websiteURLs: item.websiteName,
            SK: item.link,
            title: item.title_,
            summary: summaryArr,
            articleText: item.articleText,
            date: item.date,
            processedAt: new Date().toISOString(),
            ttl: week,
            paywall: item.paywall
        }
    }))
}

async function flagRSSPaywall(baseUrl){
    return dynamo.send(new UpdateCommand({
        TableName: TABLE,
        Key: { websiteURLs: baseUrl, SK: SK.RSS },
        UpdateExpression: 'SET paywall = :p',
        ExpressionAttributeValues: { ':p': true }
    }))
}

async function updateSummary(item, summary,mode){
    return dynamo.send(new UpdateCommand({
        TableName: TABLE,
        Key: {
        websiteURLs: item.websiteName,
        SK: item.link
        },
        UpdateExpression: `SET summary[${promptIndex[mode]}] = :summary`,
        ExpressionAttributeValues: {':summary': summary}
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

export const handler = async(event, useContext) => {
    console.log("Raw body:", event.Records[0].body);
    const body = JSON.parse(event.Records[0].body)
    const website = body.website
    const scrapedWebsite = await initialScraper(website)
    const jSON = {
        username: body.username,
        website: website,
        data: scrapedWebsite
    }
    console.log(JSON.stringify(jSON, null, 2))
}

async function initialScraper(url,mode="default") {
    const cleanURL = new URL(url)
    const data = await linkBuilder(cleanURL)
    if (!data){
        console.log("Couldn't grab RSS feed")
        return null
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
    await dynamo.send(new UpdateCommand({
        TableName: TABLE,
        Key: { websiteURLs: cleanURL.origin, SK: SK.RSS },
        UpdateExpression: 'SET siteName = :n',
        ExpressionAttributeValues: { ':n': webName }
    }))
    let existingCount=0
    let newCount=0
    let scrapedCount=0
    let paywallCount=0
    let articleList=[]
    for (const element of items) {
        const guid = $(element).find(formats[format].guid).text()
        const exists = await guidChecker(guid)
        if (exists.Item){
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
            websiteName:url,
            link: link,
            guid_: guid,
            title_:title,
            articleText: articleTextAndTime.articleText,
            date:articleTextAndTime.publishDate,
            processedAt: new Date().toISOString(),
            paywall: articleTextAndTime.paywallStatus
        }
        scrapedCount+=1
        console.log(articleContent)
        articleList.push(articleContent)
    }
    const totalProcessed = scrapedCount + paywallCount
    console.log(`Paywall: ${paywallCount}/${totalProcessed} articles`)
    if (totalProcessed > 0 && paywallCount / totalProcessed >= 0.7) {
        console.log(`70%+ paywall rate detected for ${url}, flagging RSS row`)
        const baseUrl = new URL(url).origin
        await flagRSSPaywall(baseUrl)
    }
    for (let i = 0 ; i < articleList.length; i += 5){
        const chunk = articleList.slice(i, i + 5)
        const chunkIndex = Math.floor(i / 5) + 1
        console.log(`\n--- CHUNK ${chunkIndex}: Sending ${chunk.length} articles to Gemini ---`)
        chunk.forEach((a, idx) => console.log(`  [${idx}] ${a.title_}`))

        const prompt = chunk.map((x, indx) => `Article ${indx + 1}: ${x.title_}\n${x.articleText}`).join('\n\n')

        let summarization = null
        try {
            const geminiStart = Date.now()
            const x = await ai.models.generateContent({
                model:"gemini-2.5-flash",
                config: {systemInstruction: prompts[mode],
                    responseMimeType:"application/json",
                    responseSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string' },
                            summary: { type: 'string' }
                        },
                        required: ['title', 'summary']
                    }}
                },
                contents:prompt,
            })
            const geminiMs = Date.now() - geminiStart
            console.log(`Gemini responded in ${geminiMs}ms`)
            console.log("Gemini raw response:", x.text)

            const cleaned = x.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
            try {
                summarization = JSON.parse(cleaned)
                console.log(`Gemini returned ${summarization.length} summaries for ${chunk.length} articles`)
                if (summarization.length !== chunk.length) {
                    console.warn(`--- MISMATCH: expected ${chunk.length}, got ${summarization.length} ---`)
                }
            } catch (parseErr) {
                console.error(`JSON.parse failed for chunk ${chunkIndex}:`, parseErr.message)
                console.error("Raw text that failed:", x.text)
                continue
            }
        } catch (geminiErr) {
            console.error(`Gemini API call failed for chunk ${chunkIndex}:`, geminiErr.message)
            continue
        }

        for (let j = 0; j < chunk.length; j++) {
            if (summarization[j]) {
                try {
                    await dbGUID(chunk[j].guid_)
                    await newArticle(chunk[j], summarization[j].summary, mode)
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
}

async function scrapeArticles(url, format) {
    const sourceURL = new URL(url)
    let data = null
    try {
        const response = await axios.get(sourceURL.href)
        data = response.data
    } catch (error) {
        if (error.response && (error.response.status === 429 || error.response.status === 403)){ 
            data = await javascriptHTMLScraper(sourceURL.href)
        } else {
            console.log(`Failed to scrape ${url}: ${error.message}`)
            return {articleText: "couldn't be scraped", publishDate: "couldn't be found"}}
        }
        if (!data){return {articleText: "couldn't be scraped", publishDate: "couldn't be found"}}
        const $ = cheerio.load(data)
        let paywallStatus=false
        const paywallBySelector = paywallIndicators.some(selector => $(selector).length > 0)
        const articleBodyText = $(".entry-content, .c-entry-content, article, .article-body, .story-content, main").first().text()
        const paywallByPhrase = paywallPhrases.some(p => p.test(articleBodyText))
        if(paywallBySelector || paywallByPhrase){
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
        ).remove();
        const publishDate = 
            $('time').attr('datetime') ||                                     
            $('meta[property="article:published_time"]').attr('content') ||   
            $('meta[name="pubdate"]').attr('content') ||                      
            $('meta[name="date"]').attr('content') ||                         
            null;    
        const articleText = $(".entry-content p, .c-entry-content p, article p, .article-body p, .story-content p, .content__body p, #content--body p, .article-content p, main p")
        .map((index, element) => $(element).text())
       .get()
        .filter(text => text.length > 0)
        .join('\n\n')
        .trim();    
        
        return {articleText, publishDate, paywallStatus}
    }

async function linkBuilder(url) {
    const baseUrl = url.origin

    const cached = await dbGet(baseUrl, SK.RSS)
    if (cached.Item) {
        try {
            const response = await axios.get(cached.Item.rss_url, axiosConfig)
            console.log("RSS Feed Found, Using")
            return response.data
        } catch(err){
            const xmlData = await javascriptBypasser(cached.Item.rss_url)
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
                if (!feedData){ console.log("Fucking failed"); continue }
            } else {
                continue
            }
        }
        try {
            await dbPut({ websiteURLs: baseUrl, SK: SK.RSS, rss_url: testURL })
        } catch(err) {
            console.log(`DynamoDB PutCommand failed: ${err.message}`)
        }
        return feedData
    }
    return null
}

async function javascriptBypasser(url){
    const browser = await chromium.launch({
        args: chromiumLambda.args,
        executablePath: await chromiumLambda.executablePath(),
        headless: chromiumLambda.headless,
    })
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
}

async function javascriptHTMLScraper(url){
    const browser = await chromium.launch({
        args: chromiumLambda.args,
        executablePath: await chromiumLambda.executablePath(),
        headless: chromiumLambda.headless,
    })
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
}

// initialScraper("https://theverge.com")
