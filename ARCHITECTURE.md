# Signal — Architecture

A personalized news briefing app. Subscribe to news sites, a scraper pulls their RSS
feeds, Gemini summarizes each article at three depths, and a dashboard serves the briefing.

- **Frontend** — Next.js 16 / React 19 / Tailwind v4 (`frontend/`)
- **API** — Spring Boot 4.0.6 on Java 21 (`organization_api/`)
- **Worker** — Node 18 AWS Lambda (`article_grabber/`)
- **Stores** — Postgres (accounts) + DynamoDB (articles)

---

## 1. System overview

```mermaid
flowchart TB
    subgraph client["Browser"]
        UI["Next.js SPA<br/>react-router MemoryRouter"]
    end

    subgraph api["Spring Boot API :8080"]
        SEC["Spring Security<br/>FilterJWT + rate limit"]
        CTRL["Controllers<br/>user / website / keywords<br/>saved / activity"]
        SVC["UserService<br/>DynamoService + Caffeine cache"]
    end

    subgraph aws["AWS · us-east-2"]
        SQS["SQS<br/>news_scraper_queue"]
        LAMBDA["Lambda<br/>SingleArticleScraper"]
        DDB[("DynamoDB<br/>MyScrapingHandlerTable")]
    end

    PG[("Postgres<br/>users · subscriptions<br/>saved · activity · refresh")]
    GEM["Google Gemini<br/>2.5 Flash / Flash-Lite"]
    WEB["News sites<br/>RSS + article pages"]

    UI -->|"httpOnly cookies<br/>via next.config rewrites"| SEC
    SEC --> CTRL --> SVC
    SVC --> PG
    SVC -->|"read feed"| DDB
    SVC -->|"resummarize on demand"| GEM
    CTRL -->|"POST /user/task"| SQS
    SQS -->|"1 msg = 1 site"| LAMBDA
    LAMBDA -->|"scrape"| WEB
    LAMBDA -->|"summarize"| GEM
    LAMBDA -->|"write articles"| DDB

    classDef awsBox fill:#ff9900,stroke:#7a4a00,color:#1a1a1a
    classDef ext fill:#4285f4,stroke:#1a3d7c,color:#fff
    class SQS,LAMBDA,DDB awsBox
    class GEM,WEB ext
```

> **Without an AWS subscription** the orange boxes are dark. Nothing in the scraping or
> summarization logic is AWS-proprietary — AWS only occupies the two edges,
> transport (SQS) and storage (DynamoDB).

---

## 2. The two paths

```mermaid
flowchart LR
    subgraph read["READ · dashboard mount"]
        direction TB
        R1["GET /api/user/website"] --> R2["subscriptions<br/>from Postgres"]
        R2 --> R3["query DynamoDB<br/>per site"]
        R3 --> R4["filter: processed<br/>within 24h"]
        R4 --> R5["warm articleText<br/>Caffeine cache"]
        R5 --> R6["render feed"]
    end

    subgraph write["WRITE · Update Feed"]
        direction TB
        W1["POST /user/task"] --> W2["1 SQS msg<br/>per subscribed site"]
        W2 --> W3["Lambda fan-out"]
        W3 --> W4["write to DynamoDB"]
        W4 -.->|"no callback"| W5["frontend polls until<br/>count plateaus · 5min cap"]
    end
```

There is **no scheduler**. Articles only appear when a user hits *Update Feed* or adds a
source. Completion is detected by polling, not by a callback.

---

## 3. Scraper pipeline — `article_grabber.js`

```mermaid
flowchart TB
    START["SQS message<br/>{username, website}"] --> FEED

    FEED["linkBuilder()<br/>probe /feed /rss.xml /index.xml /atom.xml<br/>cache winner at SK=RSS"]
    FEED -->|"429 / 403"| PW["Playwright<br/>headless Chromium"]
    PW --> PARSE
    FEED --> PARSE["cheerio parse<br/>rss | atom auto-detect"]

    PARSE --> LOOP{"per feed item"}

    LOOP --> G["guidChecker()<br/>SK=EXISTS lookup"]
    G -->|"seen"| DROP["drop"]
    G --> AGE{"older than 24h?"}
    AGE -->|"yes"| DROP
    AGE --> PAT{"listicle / deal /<br/>buying guide?"}
    PAT -->|"match"| DROP
    PAT --> SCRAPE["scrapeArticles()<br/>strip boilerplate, extract p<br/>detect paywall"]
    SCRAPE --> LEN{"long enough?<br/>500 chars · 1500 if paywalled"}
    LEN -->|"no"| DROP
    LEN --> POD{"podcast page?"}
    POD -->|"yes"| DROP

    POD --> BATCH["chunk into 5s"]
    BATCH --> GEMINI["Gemini 2.5 Flash<br/>responseSchema forces<br/>[{title, summary}]"]
    GEMINI --> WRITE["dbGUID() + newArticle()<br/>ttl = 7 days"]
    WRITE --> FLAG{"≥70% of run<br/>paywalled?"}
    FLAG -->|"yes"| SITEFLAG["flagRSSPaywall()<br/>mark whole site"]

    style DROP fill:#6b7280,stroke:#374151,color:#fff
    style GEMINI fill:#4285f4,stroke:#1a3d7c,color:#fff
```

**Known gap:** `handler` calls `initialScraper(website)` with no mode argument, so the
per-source `websiteContentMode` never reaches the Lambda. Only the `default` summary slot
is filled at scrape time; short and deep-dive are lazy-filled later on demand.

---

## 4. Auth — JWT with refresh rotation

```mermaid
sequenceDiagram
    participant B as Browser
    participant F as FilterJWT
    participant S as ServiceJWT
    participant P as Postgres

    B->>F: POST /auth/signin
    Note over F: /auth/** is permitAll
    F->>S: authenticate (BCrypt)
    S->>P: store refresh token row
    S-->>B: Set-Cookie accessToken  (1h, path=/)
    S-->>B: Set-Cookie refreshToken (7d, path=/auth)

    B->>F: GET /api/user/website
    Note over F: 1. Bucket4j rate limit by IP<br/>10 req, refill 1 per 10s
    F->>F: 2. verify signature + expiry
    F->>F: 3. load User into SecurityContext
    F-->>B: 200 feed

    Note over B: access token expires
    B->>F: GET /api/user/website
    F-->>B: 401

    Note over B: authenticatedFetch intercepts<br/>single-flight: concurrent 401s<br/>share one refresh promise
    B->>S: POST /auth/refresh
    S->>P: look up token, check expiry
    S->>P: DELETE old row (rotation)
    S->>P: INSERT new row
    S-->>B: new cookie pair
    B->>F: retry original request
    F-->>B: 200 feed
```

| | Access token | Refresh token |
|---|---|---|
| Subject | `username` | `uniqueUUID` |
| TTL | 1 hour | 7 days |
| Secret | `SECRET_KEY` | `SECRET_REFRESH_KEY` |
| Cookie path | `/` | `/auth` |
| Stored server-side | no | yes — Postgres row |

Both httpOnly, `SameSite=Strict`. Scoping the refresh cookie to `/auth` keeps it off
ordinary API calls.

**Before deploying:** `secure(false)` is hardcoded on both cookies. The refresh token is
`@OneToOne` per user, so a second device silently ends the first session. Admin gating is a
hardcoded `"rohil".equals(username)` check rather than a role system.

---

## 5. Data model

```mermaid
erDiagram
    USER ||--o{ SUBSCRIPTION : "subscribes to"
    USER ||--o{ SAVED_ARTICLE : bookmarks
    USER ||--o{ USER_ACTIVITY : generates
    USER ||--o| REFRESH_TOKEN : "has one"

    USER {
        int id PK
        string username UK
        string password "bcrypt"
        string keywords "comma-joined"
        uuid uniqueUUID UK
    }
    SUBSCRIPTION {
        string websiteURL
        string contentMode
    }
    SAVED_ARTICLE {
        string articleLink
        string articleTitle
    }
    USER_ACTIVITY {
        string articleLink
        int score "write-only today"
    }
    REFRESH_TOKEN {
        string token UK
        datetime expireAt
    }
```

DynamoDB is a separate single-table design, joined to Postgres only in application code
via the `websiteURL` string:

```mermaid
flowchart LR
    subgraph t["MyScrapingHandlerTable · PK websiteURLs · SK"]
        A["SK = 'RSS'<br/>siteName · rss_url · paywall"]
        B["SK = article GUID<br/>dedupe marker · ttl 7d"]
        C["SK = article link<br/>title · summary[3] · articleText<br/>publishedAt · processedAt · ttl 7d"]
    end
```

`summary` is a 3-slot array: `shorter`→0, `default`→1, `longer`→2. Re-summarizing from the
UI bypasses the Lambda entirely — Spring reads cached article text from Caffeine, calls
Gemini directly, and async-writes back into the right slot.

---

## 6. Unfinished threads

```mermaid
flowchart LR
    ACT["Activity tracking<br/>beacon on pagehide"] -->|"writes"| DB[("user_activity")]
    DB -.->|"nothing reads it"| ALGO["Ranking algorithm<br/>NOT BUILT"]

    KW["Keywords"] -->|"CRUD only"| API2["Spring API"]
    KW -->|"actual matching"| CLIENT["client-side<br/>scoreArticleForKeyword<br/>+ hand-written synonyms"]

    style ALGO fill:#6b7280,stroke:#374151,color:#fff,stroke-dasharray: 5 5
```

- **Activity tracking is write-only** — the training signal for the ranking algorithm is
  being collected and never read. This is where the last commit's *"want to add the
  algorithm next"* points.
- **Keyword filtering is entirely client-side.** The backend does pure CRUD on a
  comma-joined string column.
- **Uncommitted WIP in `DashboardPage.tsx`** — Hot Topics mode, first-run empty states, and
  the polling plateau heuristic. It also removes the 24h display filter in three places.
- **`preferredUpdateTime`** is still editable in Settings but the code consuming it is
  commented out.
