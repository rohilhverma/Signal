import { GoogleGenAI } from '@google/genai'
import "dotenv/config"

export const prompts = {
    "shorter" : "You are a news wire editor. Summarize each article in 2-3 bullet points. Each bullet must be one sentence, maximum 20 words. Bullet 1: What happened — the core event, stated as a fact. Bullet 2: Who is involved and what specifically they did. Bullet 3 (only if needed): A key number or outcome that adds value. Rules: No filler phrases like \"it's worth noting\" or \"according to\"; No background or history unless critical to understanding the event; If a bullet doesn't add new information, cut it; Start each bullet with the subject, not a verb. Return ONLY a valid JSON array. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\".",
    "default" : "You are a news briefing editor. For each article, write a single paragraph summary of 4-6 sentences. Each summary must include: 1. The core event — what happened, stated directly; 2. Context — how this connects to related events or industry trends; 3. Implication — what this signals or why it matters going forward; 4. Key specifics — include relevant numbers, names, and concrete details. Write in a flowing paragraph, not bullet points. Do not use filler phrases. State facts directly with no editorializing. Return ONLY a valid JSON array. Do not wrap in markdown backticks or code blocks, only use objects containing \"title\" and \"summary\".",
    "longer": "You are a senior analyst writing intelligence briefings. For each article, you MUST write exactly 3 paragraphs separated by blank lines. No more, no fewer.\n\nParagraph 1 — What happened: who was involved, concrete specifics, relevant numbers, names, dates, and technical details from the article.\n\nParagraph 2 — Context: how this event connects to related developments, competing efforts, or previous events. Draw only from information within the article. If the article provides little context, connect the facts and details stated in paragraph 1.\n\nParagraph 3 — Implications: what this signals going forward, based only on what the article states or directly implies. If implications are not explicit, derive them logically from the facts in paragraph 1.\n\nRules:\n- Output MUST be exactly 3 paragraphs separated by blank lines\n- No labels, headers, or markers before paragraphs\n- No filler phrases or editorializing\n- Never introduce outside knowledge\n- Every sentence must be traceable to the article text\n\nReturn ONLY a valid JSON array. Each object has \"title\" and a \"summary\" object with three fields: \"happened\", \"context\", and \"implications\" — one paragraph of prose each."
}

let aiClient = null
function getAI() {
    if (!aiClient) { aiClient = new GoogleGenAI({}) }
    return aiClient
}

/**
 * Gemini implementation. Takes the chunk of scraped articles and returns
 * [{ title, summary }] — one entry per article, in order.
 */
async function summarizeWithGemini(articles, mode) {
    const prompt = articles
        .map((x, indx) => `Article ${indx + 1}: ${x.title_}\n${x.articleText}`)
        .join('\n\n')

    const geminiStart = Date.now()
    const x = await getAI().models.generateContent({
        model: "gemini-2.5-flash",
        config: {
            systemInstruction: prompts[mode],
            responseMimeType: "application/json",
            responseSchema: schemaFor(mode)
        },
        contents: prompt,
    })
    const geminiMs = Date.now() - geminiStart
    console.log(`Gemini responded in ${geminiMs}ms`)
    console.log("Gemini raw response:", x.text)

    const cleaned = x.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return normalize(JSON.parse(cleaned), mode)
}

/**
 * Shape both providers must return. Gemini takes this as `responseSchema`,
 * Ollama as `format` — same JSON Schema either way.
 */
const RESPONSE_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            title: { type: 'string' },
            summary: { type: 'string' }
        },
        required: ['title', 'summary']
    }
}

/**
 * "longer" asks for exactly three paragraphs. Asking for that in prose does not work —
 * a 4B model produced one paragraph in 9 of 10 cases — so the structure is enforced by
 * the schema instead, the same mechanism that makes title/summary reliable. The three
 * fields are rejoined into one string before storage, so summary_long stays a text column.
 */
const LONGER_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            title: { type: 'string' },
            summary: {
                type: 'object',
                properties: {
                    happened: { type: 'string' },
                    context: { type: 'string' },
                    implications: { type: 'string' }
                },
                required: ['happened', 'context', 'implications']
            }
        },
        required: ['title', 'summary']
    }
}

function schemaFor(mode) {
    return mode === 'longer' ? LONGER_SCHEMA : RESPONSE_SCHEMA
}

/** Collapses the structured "longer" shape back into the single string callers expect. */
function normalize(entries, mode) {
    if (mode !== 'longer') return entries
    return entries.map(entry => ({
        title: entry.title,
        summary: typeof entry.summary === 'string'
            ? entry.summary
            : [entry.summary?.happened, entry.summary?.context, entry.summary?.implications]
                .filter(Boolean).join('\n\n')
    }))
}

/**
 * Local model via Ollama. Two settings matter and both are easy to get wrong:
 *
 *  - num_ctx: Ollama's default context is smaller than a batch of scraped articles.
 *    Overflow does not error, it silently truncates, so the model never sees the tail
 *    of the batch and returns fewer summaries than it was given.
 *  - think: qwen3 and friends are hybrid reasoning models. Left on, the reasoning is
 *    generated inside the response and wastes both context and wall-clock for what is
 *    a mechanical summarization job.
 */
async function summarizeWithOllama(articles, mode) {
    const host = process.env.OLLAMA_URL || "http://localhost:11434"
    const model = process.env.OLLAMA_MODEL || "qwen3:4b"
    const numCtx = Number(process.env.OLLAMA_NUM_CTX || 8192)

    const prompt = articles
        .map((x, indx) => `Article ${indx + 1}: ${x.title_}\n${x.articleText}`)
        .join('\n\n')

    const start = Date.now()
    const response = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: prompts[mode] },
                { role: 'user', content: prompt }
            ],
            stream: false,
            think: false,
            format: schemaFor(mode),
            keep_alive: process.env.OLLAMA_KEEP_ALIVE || "60s",
            options: { num_ctx: numCtx, temperature: 0.3 }
        })
    })

    if (!response.ok) {
        throw new Error(`Ollama ${response.status}: ${(await response.text()).slice(0, 200)}`)
    }

    const payload = await response.json()
    console.log(`Ollama (${model}) responded in ${Date.now() - start}ms`)

    const text = payload?.message?.content
    if (!text) throw new Error("Ollama returned no message content")

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return normalize(JSON.parse(cleaned), mode)
}

const providers = {
    gemini: summarizeWithGemini,
    ollama: summarizeWithOllama,
}

/** Local models need smaller batches to stay inside their context window. */
const DEFAULT_BATCH_SIZE = { gemini: 5, ollama: 3 }

export function batchSize() {
    const override = Number(process.env.SUMMARY_BATCH_SIZE)
    if (Number.isInteger(override) && override > 0) return override
    return DEFAULT_BATCH_SIZE[process.env.SUMMARIZER_PROVIDER || "ollama"] || 3
}

/**
 * summarize(articles, mode) -> [{ title, summary }]
 * Provider chosen by SUMMARIZER_PROVIDER (default "ollama"; set to "gemini" to
 * fall back to the hosted model).
 * Throws on API failure or unparseable output; callers decide how to recover.
 */
export async function summarize(articles, mode = "default") {
    const name = process.env.SUMMARIZER_PROVIDER || "ollama"
    const provider = providers[name]
    if (!provider) {
        throw new Error(`Unknown SUMMARIZER_PROVIDER: ${name}`)
    }
    return provider(articles, mode)
}

export default summarize
