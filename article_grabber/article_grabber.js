import * as cheerio from 'cheerio'
import axios from 'axios'
import { response } from 'express'

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

async function initialScrape(url) {
    const cleanURL = new URL(url)
    const data = await linkBuilder(cleanURL)
    const $ = cheerio.load(data, {xmlMode:true})

    let format = 'rss'
    if ($('feed').length){format = 'atom'}
    else if ($('rss').length){format = 'rss'}
    
    const items = $(formats[format].itemSelector).toArray()
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
    const {data} = await axios.get(sourceURL.href)
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
            const response = await axios.get(testURL, {timeout:5000})
            return response.data
        } catch(err) {
            console.log(`Failed ${testURL}`)
        }
    }
    return null
}


const jSON = await initialScrape("https://venturebeat.com/")

console.log(jSON.articles)