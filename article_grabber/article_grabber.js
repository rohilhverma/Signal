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
    shorter : "You are a news wire editor. Summarize each article in 2-3 bullet points. Each bullet must be one sentence, maximum 20 words. Bullet 1: What happened — the core event, stated as a fact. Bullet 2: Who is involved and what specifically they did. Bullet 3 (only if needed): A key number or outcome that adds value. Rules: No filler phrases like \"it's worth noting\" or \"according to\"; No background or history unless critical to understanding the event; If a bullet doesn't add new information, cut it; Start each bullet with the subject, not a verb. Return ONLY a valid JSON array.Do not use double quotes inside summary text. Use single quotes instead. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\".",
    default : "You are a news briefing editor. For each article, write a single paragraph summary of 4-6 sentences. Each summary must include: 1. The core event — what happened, stated directly; 2. Context — how this connects to related events or industry trends; 3. Implication — what this signals or why it matters going forward; 4. Key specifics — include relevant numbers, names, and concrete details. Write in a flowing paragraph, not bullet points. Do not use filler phrases. State facts directly with no editorializing. Return ONLY a valid JSON array.Do not use double quotes inside summary text. Use single quotes instead. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\".",
    longer: "You are a senior analyst writing intelligence briefings. For each article, write a detailed analysis following this exact structure:\n\n[PARAGRAPH 1 - THE EVENT]\nWhat happened, who was involved, and the concrete specifics. Include all relevant numbers, names, dates, and technical details found in the article. Leave nothing important out. End this paragraph, then start a new one.\n\n[PARAGRAPH 2 - THE CONTEXT] (only if the article provides it)\nUsing ONLY information found within the article, explain how this event connects to related developments, competing efforts, or previous events that the article mentions. Do not reference any information outside of the provided text. If the article does not provide broader context, skip this paragraph entirely.\n\n[PARAGRAPH 3 - THE IMPLICATIONS] (only if the article supports it)\nBased ONLY on what the article states or directly implies, what does this signal going forward? Do not speculate beyond what the text supports. If the article does not discuss implications, skip this paragraph entirely.\n\nRules:\n- Each paragraph MUST be separated by a blank line\n- Never combine multiple sections into one paragraph\n- Include specific numbers, names, and data points\n- Draw connections ONLY between details within the article\n- No filler phrases or editorializing\n- Never introduce outside knowledge\n- Every sentence must be traceable to the article text\n\nReturn ONLY a valid JSON array.Do not use double quotes inside summary text. Use single quotes instead. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\"."
}
const paywallIndicators = [
    '.paywall',
    '.subscription-required',
    '.meter-limit',
    '#paywall',
    '.premium-content',
    '.locked-content',
    '[data-paywall]'
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

async function newArticle(item){
    const week = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

    return dynamo.send(new PutCommand({
        TableName: TABLE,
        Item: {
            websiteURLs: item.websiteName,
            SK: item.link,
            title: item.title_,
            summary: "",
            articleText: item.articleText,
            date: item.date,
            ttl: week,
            paywall: item.paywall
        }
    }))
}

async function updateSummary(item, summary){
    return dynamo.send(new UpdateCommand({
        TableName: TABLE,
        Key: {
        websiteURLs: item.websiteName,
        SK: item.link
        },
        UpdateExpression: 'SET summary = :summary', 
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

async function initialScraper(url) {
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
    const webName = $(formats[format].websiteTitle).text()
    const json_ = {
        "publisher": `${webName}`,
        "articles": []
    }
    let existingCount=0
    let newCount=0
    let articleList=[]
    for (const element of items) {
        const guid = $(element).find(formats[format].guid).text()
        const exists = await guidChecker(guid)
        if (exists.Item){
            existingCount+=1
            continue
        } else {
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
        const title = $(element).find(formats[format].title).text()
        if (articleDate < cutoff){console.log(`${title}: Too old, Skipping`); continue}
        let link = $(element).find('link').text()
        if(!link){link = $(element).find(formats[format].link).attr('href')}
        if (!link){continue}
        const articleTextAndTime = await scrapeArticles(link)
        const articleContent = {
            websiteName:url,
            link: link,
            guid_: guid,
            title_:title,
            articleText: articleTextAndTime.articleText,
            date:articleTextAndTime.publishDate,
            paywall: articleTextAndTime.paywallStatus   
        }
        await dbGUID(guid)
        await newArticle(articleContent)
        newCount+=1
        if (!articleContent.paywall) { articleList.push(articleContent) }
    }
    for (let i = 0 ; i < articleList.length; i += 5){ 
        const chunk = articleList.slice(i, i + 5)
        const prompt = chunk.map((x, indx) => `Article ${indx + 1}: ${x.title_}\n${x.articleText}`).join('\n\n')
        const x = await ai.models.generateContent({
            model:"gemini-2.5-flash-lite",
            config: {systemInstruction: prompts.default,
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
        console.log("Gemini raw response:", x.text)
        const cleaned = x.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const summarization = JSON.parse(cleaned)

        for (let i = 0; i < chunk.length; i ++) {
            if (summarization[i]){
                const updateResult = await updateSummary(chunk[i], summarization[i].summary)
                console.log("Update Result", updateResult)
            }
        }
        
    }
    console.log({website_:url,
                newArticles_: newCount,
                existingArticles_: existingCount
    })
}}

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
        const paywall = paywallIndicators.some(selector => $(selector).length>0)
        if(paywall){
            console.log("Paywall Detected!")
            return {articleText: null, publishDate: null, paywallStatus: true}
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