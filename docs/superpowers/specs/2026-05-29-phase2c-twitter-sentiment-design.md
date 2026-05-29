# Phase 2c — Twitter Sentiment Feed — Design Spec

**Date:** 2026-05-29
**Status:** Approved design (pending spec review)
**Builds on:** Phase 1 (auth) + Phase 2a (price) + Phase 2b (news), all merged to `main` (44 tests passing).
**Reference spec:** `docs/superpowers/specs/2026-05-29-signal-intelligence-dashboard-design.md` — F3 (Twitter Live Feed / Sentiment AI), §6 endpoints (`GET /api/tweets`), §7 cron 3–5 min, AI = Sonnet default + prompt caching.

---

## Goal

Scrape OCT-related tweets on a ~5-minute schedule, classify each tweet with Claude
**Sonnet** as **Bullish / Bearish / Whale**, cache the enriched list under a `tweets`
cache key, and serve it via a protected `GET /api/tweets` endpoint.

Everything is built **mock-first**: all external calls (the scraper, the AI provider)
go through injectable functions, so the entire feature is testable with **no API keys**.
Live wiring is an env-var change later — no code edits.

## Scope

**In scope (Phase 2c):**
- Twitter scraper source (`fetchTweets`), provider-abstracted, injectable fetch.
- Claude Sonnet batched sentiment classification, provider-agnostic core with two adapters.
- `GET /api/tweets` protected read route.
- Config + scheduling + docs.

**Explicitly deferred:**
- **Phase 2d:** Opus on-demand deep analysis (`POST /api/analyze`, F4). More useful once
  real tweet + sentiment data exists; on-demand (not scheduled) so it is a separate concern.
- **Live credentials:** real Apify/Xpoz scraper key and real `OPENROUTER_API_KEY` /
  `ANTHROPIC_API_KEY`. Set env vars when available; no code change required.

---

## Architecture

Follows the proven Phase 2a/2b shape: `sources/ → service → scheduler (runCacheUpdate) → route`,
with one new layer — a provider-agnostic AI classifier.

```
scrape (twitter.js)  ──►  classify (ai/sentiment.js)  ──►  tweetsService.buildTweets
        │                         │                                 │
   injectable               injectable complete()            runCacheUpdate({key:'tweets'})
   getJsonFn                 (anthropic | openrouter)                │
                                                              SQLite cache 'tweets'
                                                                     │
                                                          GET /api/tweets (protected)
```

### New / modified files

| File | Status | Purpose |
|------|--------|---------|
| `src/sources/twitter.js` | NEW | `fetchTweets({ getJsonFn, token, keywords, limit })` → normalized `[{ id, text, author, url, createdAt }]`. Provider-abstracted (Apify/Xpoz swap later); injectable `getJsonFn` like other sources. |
| `src/ai/sentiment.js` | NEW | `classifyTweets({ tweets, complete, model })` — provider-agnostic. Builds a cached system prompt + one batched user message, calls injected `complete()`, maps returned labels back to tweets by id. |
| `src/ai/providers/openrouter.js` | NEW | `createOpenRouterComplete({ apiKey, fetchFn })` → `complete(messages, opts)` against `https://openrouter.ai/api/v1/chat/completions`. Passes `cache_control` on Anthropic models. |
| `src/ai/providers/anthropic.js` | NEW | `createAnthropicComplete({ apiKey })` → `complete(...)` via `@anthropic-ai/sdk`, native `cache_control: { type: 'ephemeral' }` blocks. |
| `src/tweetsService.js` | NEW | `buildTweets({ fetchFn, classifyFn })` — scrape → classify → enriched array. Mirrors `priceService.js`. |
| `src/routes/cache.js` | MODIFY | add `GET /tweets` (401 / 503 / 200), identical to `/news`. |
| `src/config.js` | MODIFY | add AI + twitter config fields (below). |
| `src/server.js` | MODIFY | construct the active AI adapter, schedule the tweets task. |
| `package.json` | MODIFY | add `@anthropic-ai/sdk` dependency. |
| `backend/.env.example`, `backend/README.md` | MODIFY | document new env + endpoint. |

### AI provider abstraction

`classifyTweets` never knows the provider. It depends only on an injected
`complete(messages, { cacheSystemPrompt })` function that returns the model's text reply.
Two adapters satisfy that interface:

| Adapter | Transport | Key | Default model | Prompt caching |
|---------|-----------|-----|---------------|----------------|
| OpenRouter (**default**) | OpenAI-compatible REST | `OPENROUTER_API_KEY` | `anthropic/claude-sonnet-4.6` | `cache_control` passed through on Anthropic models |
| Anthropic (official) | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` | native `cache_control: { type: 'ephemeral' }` |

`config.aiProvider` (`'openrouter' | 'anthropic'`, default `'openrouter'`) selects the adapter
in `server.js`. Because tests mock the `complete`/`classifyFn` boundary, neither SDK nor key
is exercised in the suite.

### Classification approach

- **One batched call per refresh cycle.** All freshly-scraped tweets go in a single message;
  the model returns one label per tweet, aligned by tweet `id`. Cheapest (one cached system
  prompt covers the whole batch) and simplest to test.
- **Labels:** `Bullish` / `Bearish` / `Whale` (exactly spec F3).
- **Prompt caching:** the classification instructions (system prompt) are marked cacheable so
  repeated cycles get the input discount.
- **Response contract:** the model is instructed to return strict JSON
  `[{ "id": "<tweetId>", "sentiment": "Bullish|Bearish|Whale" }]`. The parser tolerates
  malformed output: any tweet missing a valid label falls back to `"Unrated"`.

### Error / degrade behavior

| Failure | Result |
|---------|--------|
| Scraper error / blocked | `runCacheUpdate` catches, no write → `GET /api/tweets` stays `503` (matches spec risk "scraper blocked → feed dies"). |
| AI provider error / no key / malformed reply | Classification degrades to `"Unrated"` per tweet (logged). Tweets still cached and served, so the feed survives a Claude/OpenRouter outage. |
| No `OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY` set | Tweets task produces `"Unrated"` tweets rather than crashing; scraper still runs (if its key/mock is present). |

> **Design note (flag at review):** the AI-failure fallback to `"Unrated"` is a deliberate
> choice so the feed degrades gracefully rather than 503'ing on a Claude hiccup. Stricter
> alternative: treat AI failure as a hard error → `503`. Default chosen: graceful `"Unrated"`.

### Config additions (`config.js`)

```
twitterIntervalMs : Number(env.TWITTER_INTERVAL_MS) || 300000   // 5 min
twitterToken      : env.TWITTER_SCRAPER_TOKEN || undefined      // Apify/Xpoz
aiProvider        : env.AI_PROVIDER || 'openrouter'
openrouterApiKey  : env.OPENROUTER_API_KEY || undefined
anthropicApiKey   : env.ANTHROPIC_API_KEY || undefined
sentimentModel    : env.SENTIMENT_MODEL || undefined            // adapter picks its default
twitterKeywords   : (env.TWITTER_KEYWORDS split ',') || ['Octra','$OCT','FHE layer1','OCT listing']
```

### Data shape served by `GET /api/tweets`

```json
[
  { "id": "...", "text": "...", "author": "...", "url": "https://x.com/...",
    "createdAt": "ISO-8601", "sentiment": "Bullish|Bearish|Whale|Unrated" }
]
```

`401` without a valid Supabase JWT; `503` until the first scheduled cycle populates the cache.

---

## Testing (TDD, all mock-driven, no keys)

| Test file | Covers |
|-----------|--------|
| `tests/sources/twitter.test.js` | URL/keyword construction, result normalization, `limit` cap, empty/missing results. |
| `tests/ai/sentiment.test.js` | mock `complete` → labels mapped by id; single batched call; system prompt marked cacheable; malformed-reply fallback to `Unrated`. |
| `tests/ai/providers/*.test.js` | each adapter constructs the correct request shape (endpoint, model, `cache_control`) using a mock `fetchFn` / SDK stub. |
| `tests/tweetsService.test.js` | scrape+classify wiring; AI-failure fallback to `Unrated`; scraper failure propagates. |
| `tests/tweets.test.js` | supertest `401` / `503` / `200` with warm cache. |
| `tests/config.test.js` | new fields parse with defaults + overrides. |

Live smoke is **deferred** (no keys). The mock suite proves all logic.

---

## Acceptance criteria

- [ ] `npm test` passes all suites including the new twitter/sentiment/tweets tests.
- [ ] `fetchTweets` normalizes scraper results to `{ id, text, author, url, createdAt }`.
- [ ] `classifyTweets` makes **one** batched call and labels each tweet `Bullish|Bearish|Whale`,
      with `Unrated` fallback on malformed/failed AI output.
- [ ] Provider switch works: `aiProvider` selects OpenRouter (default) or Anthropic; the
      classifier core is provider-agnostic and unit-tested via a mocked `complete`.
- [ ] Server schedules a ~5-min tweets update writing the `tweets` cache key via `runCacheUpdate`.
- [ ] `GET /api/tweets` returns `401` unauthed, `503` cold, `200` with enriched items when warm.
- [ ] Prompt caching is applied to the classification system prompt on both adapters.

## Out of scope (later phases)

- **Phase 2d:** Opus on-demand `POST /api/analyze` (deep analysis summary).
- **Phase 3:** Supabase login UI + frontend v3.1 wiring + VPS deploy.
- Real Apify/Xpoz + real AI key wiring (env-var change, no code edits).
