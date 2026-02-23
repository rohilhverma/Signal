import * as cheerio from 'cheerio'
import axios from 'axios'
import { response } from 'express'
import { chromium } from 'playwright'

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

//javascript code is up and running, need to try on more websites however. 




async function initialScraper(url) {
    const cleanURL = new URL(url)
    const data = await linkBuilder(cleanURL)
    console.log(data ? data.substring(0, 250) : "DATA IS NULL");
    const $ = cheerio.load(data, {xmlMode:true})
    let format = 'rss'
    if ($('feed').length){format = 'atom'}
    else if ($('rss').length){format = 'rss'}
    
    const items = $(formats[format].itemSelector).toArray()
    console.log(`--- DEBUG: FOUND ${items.length} ARTICLES --- \n`);
    const websiteName = $(formats[format].websiteTitle).text()
    const json_ = {
        "publisher": `${websiteName}`,
        "articles": []
    }
    for (const element of items) {
        const title = $(element).find(formats[format].title).text()
        let link = $(element).find('link').text()
        if(!link){link = $(element).find(formats[format].link).attr('href')}
        if (!link){continue}
        const guid = $(element).find(formats[format].guid).text()
        const articleTextAndTime = await scrapeArticles(link, format)
        json_["articles"].push({
            "title": `${title}`,
            "link": `${link}`,
            "guid": `${guid}`,
            "text": `${articleTextAndTime.articleText}`,
            "time": `${articleTextAndTime.publishDate}`,
        })
    }
    return json_

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
        const $ = cheerio.load(data)
        const publishDate = 
            $('time').attr('datetime') ||                                     
            $('meta[property="article:published_time"]').attr('content') ||   
            $('meta[name="pubdate"]').attr('content') ||                      
            $('meta[name="date"]').attr('content') ||                         
            null;    
        const articleText = $(".entry-content p, .c-entry-content p, article p, .article-body p, .story-content p")
        .map((index, element) => $(element).text())
        .get()
        .filter(text => text.length > 0)
        .join('\n\n')
        .trim();    
        
        return {articleText, publishDate}
    }

async function linkBuilder(url) {
    for (const link of rssPaths){
        const testURL = url + link
        try {
            const response = await axios.get(testURL, axiosConfig)
            return response.data
        } catch(err) {
            if (err.response && (err.response.status === 429 || err.response.status === 403)) {
            console.log(`Failed ${testURL}`)
            const xmlData = await javascriptBypasser(testURL)
            if (xmlData){return xmlData}
            else{console.log("Fucking failed")}
        }
    }
    return null
}
}

async function diagnostic(url) {
    try {
        await axios.get(url, axiosConfig)
        return initialScraper(url)
    } catch(error) {
        console.log(`Diagnostic failed: ${error.message}. Switching to javascriptScraper.`)
        return javascriptBypasser(url)
    }
}


async function javascriptBypasser(url){ 
    const browser = await chromium.launch({headless:true})
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
    const browser = await chromium.launch({headless:true})
    const page = await browser.newPage()
    try {
        console.log(`Playwright is trying to grab Article HTML: ${url}`)
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('.entry-content, .c-entry-content, .article-body, article', { timeout: 15000 });
        const rawHTML = await page.content()
        return rawHTML
    } catch(error){
        console.log(`Playwright couldn't grab the article HTML ${url}`)
        return null
    } finally {
        await browser.close()
    }
}



const jSON = await initialScraper("https://www.geekwire.com/")

console.log(jSON.articles)


 