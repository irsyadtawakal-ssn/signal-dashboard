# Phase 2c — Twitter Sentiment Feed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape OCT-related tweets on a ~5-min schedule, classify each with Claude Sonnet (Bullish/Bearish/Whale) via a provider-abstracted client (OpenRouter default, official Anthropic fallback), cache the enriched list under `tweets`, and serve it via protected `GET /api/tweets` — all built mock-first (no API keys needed to pass tests).

**Architecture:** Reuses the Phase 2a/2b pattern exactly — `sources/ → service → runCacheUpdate → route`. Adds a provider-agnostic AI layer: `ai/sentiment.js` (`classifyTweets`) depends only on an injected `complete({ system, user, model })` function; two thin adapters (`ai/providers/openrouter.js`, `ai/providers/anthropic.js`) satisfy it. Tests mock `getJsonFn` and `complete`, so neither SDK nor key is exercised.

**Tech Stack:** Existing stack (Express, better-sqlite3, vitest, supertest) + one new dependency `@anthropic-ai/sdk`. Reuses `getJson`, `setCache`/`getCache`, `requireAuth`, `scheduler.js` (`runCacheUpdate`), `routes/cache.js`.

**Reference spec:** `docs/superpowers/specs/2026-05-29-phase2c-twitter-sentiment-design.md`. **Builds on:** Phase 1 + 2a + 2b (all merged to `main`; 44 tests passing).

---

## File Structure

```
backend/src/
  config.js                 # MODIFIED: twitter + AI config fields
  sources/twitter.js        # NEW: fetchTweets({ getJsonFn, token, keywords, limit }) -> normalized tweets
  ai/sentiment.js           # NEW: classifyTweets({ tweets, complete, model }) -> tweets + sentiment
  ai/providers/openrouter.js# NEW: createOpenRouterComplete({ apiKey, fetchFn, model }) -> complete()
  ai/providers/anthropic.js # NEW: createAnthropicComplete({ apiKey, client, model }) -> complete()
  tweetsService.js          # NEW: buildTweets({ fetchFn, classifyFn })
  routes/cache.js           # MODIFIED: add GET /tweets
  server.js                 # MODIFIED: build adapter, schedule tweets task
  package.json              # MODIFIED: add @anthropic-ai/sdk
backend/tests/
  config.test.js                  # MODIFIED: assert new fields
  sources/twitter.test.js         # NEW
  ai/sentiment.test.js            # NEW
  ai/providers/openrouter.test.js # NEW
  ai/providers/anthropic.test.js  # NEW
  tweetsService.test.js           # NEW
  tweets.test.js                  # NEW (supertest 401/503/200)
backend/.env.example        # MODIFIED
backend/README.md           # MODIFIED
```

Note: `GET /api/tweets` needs **no** `app.js` change — `cacheRoute` is mounted under the `requireAuth`-gated `/api` prefix, so the new route is protected automatically.

---

## Task 1: Config fields for twitter + AI

**Files:**
- Modify: `backend/src/config.js`
- Modify: `backend/tests/config.test.js`

- [ ] **Step 1: Add failing tests**

Append inside the existing `describe('loadConfig', ...)` in `backend/tests/config.test.js`:
```js
  it('parses twitter + AI config with defaults', () => {
    const cfg = loadConfig({ SUPABASE_JWT_SECRET: 'secret' });
    expect(cfg.twitterIntervalMs).toBe(300000);
    expect(cfg.twitterToken).toBeUndefined();
    expect(cfg.aiProvider).toBe('openrouter');
    expect(cfg.openrouterApiKey).toBeUndefined();
    expect(cfg.anthropicApiKey).toBeUndefined();
    expect(cfg.sentimentModel).toBeUndefined();
    expect(cfg.twitterKeywords).toEqual(['Octra', '$OCT', 'FHE layer1', 'OCT listing']);
  });

  it('reads twitter + AI config overrides', () => {
    const cfg = loadConfig({
      SUPABASE_JWT_SECRET: 'secret',
      TWITTER_INTERVAL_MS: '60000',
      TWITTER_SCRAPER_TOKEN: 'scrapetok',
      AI_PROVIDER: 'anthropic',
      OPENROUTER_API_KEY: 'or-key',
      ANTHROPIC_API_KEY: 'an-key',
      SENTIMENT_MODEL: 'custom-model',
      TWITTER_KEYWORDS: 'foo,bar',
    });
    expect(cfg.twitterIntervalMs).toBe(60000);
    expect(cfg.twitterToken).toBe('scrapetok');
    expect(cfg.aiProvider).toBe('anthropic');
    expect(cfg.openrouterApiKey).toBe('or-key');
    expect(cfg.anthropicApiKey).toBe('an-key');
    expect(cfg.sentimentModel).toBe('custom-model');
    expect(cfg.twitterKeywords).toEqual(['foo', 'bar']);
  });
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/config.test.js`
Expected: FAIL — `twitterIntervalMs` undefined.

- [ ] **Step 3: Add the fields in `backend/src/config.js`**

In the returned object, add after `cryptopanicToken`:
```js
    twitterIntervalMs: Number(env.TWITTER_INTERVAL_MS) || 300000,
    twitterToken: env.TWITTER_SCRAPER_TOKEN || undefined,
    aiProvider: env.AI_PROVIDER || 'openrouter',
    openrouterApiKey: env.OPENROUTER_API_KEY || undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    sentimentModel: env.SENTIMENT_MODEL || undefined,
    twitterKeywords: env.TWITTER_KEYWORDS
      ? env.TWITTER_KEYWORDS.split(',').map((s) => s.trim()).filter(Boolean)
      : ['Octra', '$OCT', 'FHE layer1', 'OCT listing'],
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/config.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config.js backend/tests/config.test.js
git commit -m "feat(backend): add twitter + AI provider config fields"
```

---

## Task 2: Twitter scraper source

**Files:**
- Create: `backend/src/sources/twitter.js`
- Test: `backend/tests/sources/twitter.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/sources/twitter.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { fetchTweets } from '../../src/sources/twitter.js';

const sample = [
  {
    id: 101,
    text: 'OCT breaking out',
    author: { userName: 'trader1' },
    url: 'https://x.com/trader1/status/101',
    createdAt: '2026-05-29T10:00:00Z',
  },
  {
    id: 102,
    text: 'whales loading OCT',
    author: { userName: 'whalewatch' },
    url: 'https://x.com/whalewatch/status/102',
    createdAt: '2026-05-29T09:00:00Z',
  },
];

describe('fetchTweets', () => {
  it('normalizes scraper results', async () => {
    const getJsonFn = vi.fn().mockResolvedValue(sample);
    const items = await fetchTweets({ getJsonFn, keywords: ['Octra'] });
    expect(items).toEqual([
      { id: '101', text: 'OCT breaking out', author: 'trader1', url: 'https://x.com/trader1/status/101', createdAt: '2026-05-29T10:00:00Z' },
      { id: '102', text: 'whales loading OCT', author: 'whalewatch', url: 'https://x.com/whalewatch/status/102', createdAt: '2026-05-29T09:00:00Z' },
    ]);
  });

  it('accepts a { results: [...] } wrapper as well as a bare array', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ results: sample });
    const items = await fetchTweets({ getJsonFn, keywords: ['Octra'] });
    expect(items).toHaveLength(2);
  });

  it('encodes keywords joined by OR into the request url', async () => {
    const getJsonFn = vi.fn().mockResolvedValue([]);
    await fetchTweets({ getJsonFn, keywords: ['Octra', '$OCT'] });
    const calledUrl = getJsonFn.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent('Octra OR $OCT'));
  });

  it('includes the token in the url when provided', async () => {
    const getJsonFn = vi.fn().mockResolvedValue([]);
    await fetchTweets({ getJsonFn, keywords: ['Octra'], token: 'scrapetok' });
    expect(getJsonFn.mock.calls[0][0]).toContain('token=scrapetok');
  });

  it('returns [] when results are missing and caps at limit', async () => {
    const empty = vi.fn().mockResolvedValue({});
    expect(await fetchTweets({ getJsonFn: empty, keywords: ['x'] })).toEqual([]);

    const many = vi.fn().mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({ id: i, text: `t${i}`, author: { userName: 'u' }, url: 'u', createdAt: 'x' }))
    );
    const items = await fetchTweets({ getJsonFn: many, keywords: ['x'], limit: 5 });
    expect(items).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/sources/twitter.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/sources/twitter.js`**

```js
const { getJson } = require('../http');

// Placeholder Apify-style dataset endpoint. Confirm the exact provider URL/fields
// when wiring a real Apify/Xpoz key (see CryptoPanic note in Phase 2b — do not chase
// a live 200 here; the normalization is what these tests pin down).
const DEFAULT_BASE = 'https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items';

function normalizeTweet(t) {
  return {
    id: String(t.id),
    text: t.text || '',
    author: (t.author && t.author.userName) || 'unknown',
    url: t.url || null,
    createdAt: t.createdAt || null,
  };
}

async function fetchTweets({ getJsonFn = getJson, token, keywords = [], limit = 20, baseUrl = DEFAULT_BASE }) {
  const terms = encodeURIComponent(keywords.join(' OR '));
  const url = token
    ? `${baseUrl}?token=${token}&searchTerms=${terms}`
    : `${baseUrl}?searchTerms=${terms}`;

  const data = await getJsonFn(url, {});
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data && data.results)
      ? data.results
      : [];

  return items.slice(0, limit).map(normalizeTweet);
}

module.exports = { fetchTweets };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/sources/twitter.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/sources/twitter.js backend/tests/sources/twitter.test.js
git commit -m "feat(backend): add twitter scraper source (provider-abstracted, mock-first)"
```

---

## Task 3: Provider-agnostic sentiment classifier

Depends only on an injected `complete({ system, user, model })` returning the model's text reply. Swallows AI errors and returns `Unrated` per tweet so the feed survives an AI outage.

**Files:**
- Create: `backend/src/ai/sentiment.js`
- Test: `backend/tests/ai/sentiment.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/ai/sentiment.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { classifyTweets } from '../../src/ai/sentiment.js';

const tweets = [
  { id: '1', text: 'OCT to the moon', author: 'a', url: 'u1', createdAt: 't1' },
  { id: '2', text: 'dumping my bags', author: 'b', url: 'u2', createdAt: 't2' },
  { id: '3', text: 'huge wallet just bought', author: 'c', url: 'u3', createdAt: 't3' },
];

describe('classifyTweets', () => {
  it('makes a single batched call and maps labels back by id', async () => {
    const complete = vi.fn().mockResolvedValue(
      '[{"id":"1","sentiment":"Bullish"},{"id":"2","sentiment":"Bearish"},{"id":"3","sentiment":"Whale"}]'
    );
    const result = await classifyTweets({ tweets, complete });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.map((t) => t.sentiment)).toEqual(['Bullish', 'Bearish', 'Whale']);
    // original fields preserved
    expect(result[0]).toMatchObject({ id: '1', text: 'OCT to the moon' });
  });

  it('passes a system prompt and a user payload containing the tweets', async () => {
    const complete = vi.fn().mockResolvedValue('[]');
    await classifyTweets({ tweets, complete });
    const arg = complete.mock.calls[0][0];
    expect(typeof arg.system).toBe('string');
    expect(arg.system.length).toBeGreaterThan(0);
    expect(arg.user).toContain('OCT to the moon');
  });

  it('tolerates JSON wrapped in markdown fences', async () => {
    const complete = vi.fn().mockResolvedValue('```json\n[{"id":"1","sentiment":"Bullish"}]\n```');
    const result = await classifyTweets({ tweets: [tweets[0]], complete });
    expect(result[0].sentiment).toBe('Bullish');
  });

  it('falls back to Unrated for missing/invalid labels', async () => {
    const complete = vi.fn().mockResolvedValue('[{"id":"1","sentiment":"Nonsense"}]');
    const result = await classifyTweets({ tweets, complete });
    expect(result.map((t) => t.sentiment)).toEqual(['Unrated', 'Unrated', 'Unrated']);
  });

  it('falls back to Unrated (and does not throw) when complete rejects', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('api down'));
    const result = await classifyTweets({ tweets, complete });
    expect(result.map((t) => t.sentiment)).toEqual(['Unrated', 'Unrated', 'Unrated']);
  });

  it('returns [] without calling complete when there are no tweets', async () => {
    const complete = vi.fn();
    expect(await classifyTweets({ tweets: [], complete })).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/ai/sentiment.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/ai/sentiment.js`**

```js
const VALID = new Set(['Bullish', 'Bearish', 'Whale']);

const SYSTEM_PROMPT = [
  'You classify crypto tweets about the token Octra (OCT) for an internal trading dashboard.',
  'For each tweet, assign exactly one label:',
  '- "Bullish": optimistic / positive price expectation.',
  '- "Bearish": pessimistic / negative price expectation.',
  '- "Whale": signals large-holder or big-money activity (large buys/sells, wallet moves).',
  'Respond with ONLY a JSON array, no prose, in the form:',
  '[{"id":"<tweetId>","sentiment":"Bullish|Bearish|Whale"}]',
].join('\n');

function extractJsonArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  return JSON.parse(text.slice(start, end + 1));
}

async function classifyTweets({ tweets, complete, model }) {
  if (!tweets || tweets.length === 0) return [];

  const labels = {};
  try {
    const user = JSON.stringify(tweets.map((t) => ({ id: t.id, text: t.text })));
    const reply = await complete({ system: SYSTEM_PROMPT, user, model });
    const parsed = extractJsonArray(reply);
    for (const item of parsed) {
      if (item && VALID.has(item.sentiment)) labels[String(item.id)] = item.sentiment;
    }
  } catch (err) {
    console.error('sentiment classification failed:', err.message);
  }

  return tweets.map((t) => ({ ...t, sentiment: labels[t.id] || 'Unrated' }));
}

module.exports = { classifyTweets, SYSTEM_PROMPT };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/ai/sentiment.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/sentiment.js backend/tests/ai/sentiment.test.js
git commit -m "feat(backend): add provider-agnostic Sonnet sentiment classifier"
```

---

## Task 4: OpenRouter adapter (default)

**Files:**
- Create: `backend/src/ai/providers/openrouter.js`
- Test: `backend/tests/ai/providers/openrouter.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/ai/providers/openrouter.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { createOpenRouterComplete } from '../../../src/ai/providers/openrouter.js';

function okResponse(content) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
}

describe('createOpenRouterComplete', () => {
  it('posts to the OpenRouter endpoint with auth, model, and a cacheable system prompt', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('[]'));
    const complete = createOpenRouterComplete({ apiKey: 'or-key', fetchFn });
    await complete({ system: 'SYS', user: 'USR' });

    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer or-key');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('anthropic/claude-sonnet-4.6');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(body.messages[0].content[0].text).toBe('SYS');
    expect(body.messages[1]).toEqual({ role: 'user', content: 'USR' });
  });

  it('returns the assistant message text', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('HELLO'));
    const complete = createOpenRouterComplete({ apiKey: 'k', fetchFn });
    expect(await complete({ system: 's', user: 'u' })).toBe('HELLO');
  });

  it('honors a model override', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('[]'));
    const complete = createOpenRouterComplete({ apiKey: 'k', fetchFn });
    await complete({ system: 's', user: 'u', model: 'anthropic/claude-opus-4.8' });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).model).toBe('anthropic/claude-opus-4.8');
  });

  it('throws on a non-ok response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    const complete = createOpenRouterComplete({ apiKey: 'k', fetchFn });
    await expect(complete({ system: 's', user: 'u' })).rejects.toThrow('429');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/ai/providers/openrouter.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/ai/providers/openrouter.js`**

```js
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';

function createOpenRouterComplete({ apiKey, fetchFn = fetch, model = DEFAULT_MODEL }) {
  return async function complete({ system, user, model: modelOverride }) {
    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelOverride || model,
        messages: [
          { role: 'system', content: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenRouter request failed with status ${res.status}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  };
}

module.exports = { createOpenRouterComplete, DEFAULT_MODEL };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/ai/providers/openrouter.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/providers/openrouter.js backend/tests/ai/providers/openrouter.test.js
git commit -m "feat(backend): add OpenRouter complete() adapter with prompt caching"
```

---

## Task 5: Official Anthropic adapter + dependency

**Files:**
- Modify: `backend/package.json` (add `@anthropic-ai/sdk`)
- Create: `backend/src/ai/providers/anthropic.js`
- Test: `backend/tests/ai/providers/anthropic.test.js`

- [ ] **Step 1: Install the SDK**

Run: `cd backend && npm install @anthropic-ai/sdk`
Expected: `@anthropic-ai/sdk` added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

`backend/tests/ai/providers/anthropic.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { createAnthropicComplete } from '../../../src/ai/providers/anthropic.js';

function mockClient(text) {
  return { messages: { create: vi.fn().mockResolvedValue({ content: [{ text }] }) } };
}

describe('createAnthropicComplete', () => {
  it('calls messages.create with model, a cacheable system block, and the user message', async () => {
    const client = mockClient('[]');
    const complete = createAnthropicComplete({ client });
    await complete({ system: 'SYS', user: 'USR' });

    const arg = client.messages.create.mock.calls[0][0];
    expect(arg.model).toBe('claude-sonnet-4-6');
    expect(arg.system).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }]);
    expect(arg.messages).toEqual([{ role: 'user', content: 'USR' }]);
    expect(arg.max_tokens).toBeGreaterThan(0);
  });

  it('returns the first text content block', async () => {
    const client = mockClient('HELLO');
    const complete = createAnthropicComplete({ client });
    expect(await complete({ system: 's', user: 'u' })).toBe('HELLO');
  });

  it('honors a model override', async () => {
    const client = mockClient('[]');
    const complete = createAnthropicComplete({ client });
    await complete({ system: 's', user: 'u', model: 'claude-opus-4-8' });
    expect(client.messages.create.mock.calls[0][0].model).toBe('claude-opus-4-8');
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/ai/providers/anthropic.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `backend/src/ai/providers/anthropic.js`**

```js
const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_MODEL = 'claude-sonnet-4-6';

function createAnthropicComplete({ apiKey, client = new Anthropic({ apiKey }), model = DEFAULT_MODEL }) {
  return async function complete({ system, user, model: modelOverride }) {
    const msg = await client.messages.create({
      model: modelOverride || model,
      max_tokens: 1024,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    });
    return msg.content[0].text;
  };
}

module.exports = { createAnthropicComplete, DEFAULT_MODEL };
```

Note: tests inject `client`, so the default `new Anthropic({ apiKey })` is never constructed during tests (it is only evaluated when `client` is omitted, i.e. in `server.js`).

- [ ] **Step 5: Run, expect PASS**

Run: `cd backend && npx vitest run tests/ai/providers/anthropic.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/ai/providers/anthropic.js backend/tests/ai/providers/anthropic.test.js
git commit -m "feat(backend): add official Anthropic complete() adapter (@anthropic-ai/sdk)"
```

---

## Task 6: tweetsService (scrape → classify)

**Files:**
- Create: `backend/src/tweetsService.js`
- Test: `backend/tests/tweetsService.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/tweetsService.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { buildTweets } from '../src/tweetsService.js';

describe('buildTweets', () => {
  it('scrapes then classifies, returning the enriched tweets', async () => {
    const raw = [{ id: '1', text: 'x', author: 'a', url: 'u', createdAt: 't' }];
    const fetchFn = vi.fn().mockResolvedValue(raw);
    const classifyFn = vi.fn().mockResolvedValue([{ ...raw[0], sentiment: 'Bullish' }]);
    const result = await buildTweets({ fetchFn, classifyFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(classifyFn).toHaveBeenCalledWith(raw);
    expect(result).toEqual([{ id: '1', text: 'x', author: 'a', url: 'u', createdAt: 't', sentiment: 'Bullish' }]);
  });

  it('propagates a scraper failure (so the scheduler skips the cache write)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('scraper blocked'));
    const classifyFn = vi.fn();
    await expect(buildTweets({ fetchFn, classifyFn })).rejects.toThrow('scraper blocked');
    expect(classifyFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/tweetsService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/tweetsService.js`**

```js
async function buildTweets({ fetchFn, classifyFn }) {
  const tweets = await fetchFn();
  return classifyFn(tweets);
}

module.exports = { buildTweets };
```

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/tweetsService.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/tweetsService.js backend/tests/tweetsService.test.js
git commit -m "feat(backend): add tweetsService combining scrape + classify"
```

---

## Task 7: GET /api/tweets route

**Files:**
- Modify: `backend/src/routes/cache.js`
- Test: `backend/tests/tweets.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/tweets.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb, setCache } from '../src/db.js';
import { signTestToken, TEST_SECRET } from './helpers.js';

let app, db;
beforeEach(() => {
  db = createDb(':memory:');
  app = createApp({ db, config: { supabaseJwtSecret: TEST_SECRET } });
});

describe('GET /api/tweets', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/tweets');
    expect(res.status).toBe(401);
  });

  it('returns 503 when authed but cache is empty', async () => {
    const res = await request(app).get('/api/tweets').set('Authorization', `Bearer ${signTestToken()}`);
    expect(res.status).toBe(503);
  });

  it('returns cached tweets when authed and cache is warm', async () => {
    const items = [{ id: '1', text: 'OCT up', author: 'a', url: 'u', createdAt: 't', sentiment: 'Bullish' }];
    setCache(db, 'tweets', items);
    const res = await request(app).get('/api/tweets').set('Authorization', `Bearer ${signTestToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(items);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && npx vitest run tests/tweets.test.js`
Expected: FAIL — `/api/tweets` 404s (route not defined), so 503/200 assertions fail.

- [ ] **Step 3: Add the route in `backend/src/routes/cache.js`**

After the existing `r.get('/news', ...)` block and before `return r;`, add:
```js
  r.get('/tweets', (req, res) => {
    const hit = getCache(db, 'tweets');
    if (!hit) return res.status(503).json({ error: 'no data yet' });
    return res.json(hit.value);
  });
```
(`getCache` is already imported at the top of this file.)

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && npx vitest run tests/tweets.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/cache.js backend/tests/tweets.test.js
git commit -m "feat(backend): add protected /api/tweets route reading from cache"
```

---

## Task 8: Wire the tweets task + docs + full suite

**Files:**
- Modify: `backend/src/server.js`
- Modify: `backend/.env.example`
- Modify: `backend/README.md`

- [ ] **Step 1: Wire the tweets task into `backend/src/server.js`**

Add these requires near the other source/service requires:
```js
const { fetchTweets } = require('./sources/twitter');
const { classifyTweets } = require('./ai/sentiment');
const { createOpenRouterComplete } = require('./ai/providers/openrouter');
const { createAnthropicComplete } = require('./ai/providers/anthropic');
const { buildTweets } = require('./tweetsService');
```

After `const app = createApp({ db, config });` (and before `startScheduler`), add the AI wiring:
```js
  function buildComplete() {
    if (config.aiProvider === 'anthropic') {
      return config.anthropicApiKey
        ? createAnthropicComplete({ apiKey: config.anthropicApiKey, model: config.sentimentModel })
        : null;
    }
    return config.openrouterApiKey
      ? createOpenRouterComplete({ apiKey: config.openrouterApiKey, model: config.sentimentModel })
      : null;
  }

  const complete = buildComplete();
  const classifyFn = (tweets) =>
    complete
      ? classifyTweets({ tweets, complete })
      : Promise.resolve(tweets.map((t) => ({ ...t, sentiment: 'Unrated' })));
```

Add a second task to the `startScheduler({ tasks: [ ... ] })` array (after the news task):
```js
      {
        run: () =>
          runCacheUpdate({
            db,
            key: 'tweets',
            produceFn: () =>
              buildTweets({
                fetchFn: () =>
                  fetchTweets({ getJsonFn: getJson, token: config.twitterToken, keywords: config.twitterKeywords }),
                classifyFn,
              }),
          }),
        intervalMs: config.twitterIntervalMs,
      },
```

- [ ] **Step 2: Append to `backend/.env.example`**

```bash

# Twitter sentiment feed
# Scrape interval in ms (default 5 min)
TWITTER_INTERVAL_MS=300000
# Optional scraper token (Apify/Xpoz). Feed stays 503 until a real source is wired.
# TWITTER_SCRAPER_TOKEN=
# Comma-separated search keywords (defaults to the OCT set if blank)
# TWITTER_KEYWORDS=Octra,$OCT,FHE layer1,OCT listing

# AI sentiment provider: "openrouter" (default) or "anthropic"
AI_PROVIDER=openrouter
# OPENROUTER_API_KEY=
# ANTHROPIC_API_KEY=
# Optional model override (each provider has a sensible Sonnet default)
# SENTIMENT_MODEL=
```

- [ ] **Step 3: Update `backend/README.md`**

Add under `## Endpoints` (after the `/api/news` bullet):
```markdown
- `GET /api/tweets` — **protected**; returns cached, AI-classified tweets
  `[{ id, text, author, url, createdAt, sentiment }]` where `sentiment` is
  `Bullish | Bearish | Whale | Unrated`, or `503` until the first scheduled fetch.
```
And in the `## Background jobs` section, add:
```markdown
A tweets update (Twitter scraper, every `TWITTER_INTERVAL_MS`, default 5 min) writes the
`tweets` cache key. Each tweet is classified by Claude Sonnet via `AI_PROVIDER`
(`openrouter` default, or `anthropic`); when no AI key is set the tweets are stored
`Unrated`. A scraper failure leaves the feed at `503` until the next successful cycle.
```

- [ ] **Step 4: Full suite**

Run: `cd backend && npm test`
Expected: ALL pass (existing 44 + new: config 2, twitter 5, sentiment 6, openrouter 4, anthropic 3, tweetsService 2, tweets 3).

There is **no live smoke** for this phase — no keys (mock-first). The mock suite proves all logic. If you later set `TWITTER_SCRAPER_TOKEN` + an AI key, confirm the real scraper field names and the OpenRouter model slug, mapping them in `normalizeTweet`/the adapter as needed (same approach noted for CryptoPanic in Phase 2b — do not chase a live 200 by guessing).

- [ ] **Step 5: Commit + push**

```bash
git add backend/src/server.js backend/.env.example backend/README.md
git commit -m "feat(backend): schedule AI-classified twitter sentiment feed into cache"
git push origin <current-branch>
```

---

## Done Criteria (Phase 2c) — ✅ COMPLETE (2026-05-29, merged to `main`)

Implemented via subagent-driven development (8 tasks) + final code review (Approved, no
Critical/Important findings). Full suite: **69/69 tests passing** (18 files).

- [x] `npm test` passes all suites including new twitter/sentiment/adapter/tweets tests.
- [x] `fetchTweets` normalizes scraper results to `{ id, text, author, url, createdAt }`.
- [x] `classifyTweets` makes **one** batched call, labels each tweet `Bullish|Bearish|Whale`, and falls back to `Unrated` on failure/malformed output (never throws).
- [x] Provider switch works: `aiProvider` selects OpenRouter (default) or Anthropic; both adapters apply `cache_control` to the system prompt; the classifier core is provider-agnostic.
- [x] Server schedules a ~5-min tweets update writing the `tweets` cache key via `runCacheUpdate`.
- [x] `GET /api/tweets` returns `401` unauthed, `503` cold, `200` with enriched items when warm.

**Note (no live smoke):** mock-first — no Apify/Xpoz or AI keys yet. With no AI key, the
scheduled task stores tweets as `Unrated`; with no scraper token the feed stays `503`.
**Follow-up when wiring real keys:** confirm the real scraper field names + the OpenRouter
model slug (`anthropic/claude-sonnet-4.6`) and map them in `normalizeTweet`/the adapter.

## Out of Scope (later sub-plans)

- **Phase 2d:** Opus on-demand `POST /api/analyze` (deep analysis summary).
- **Phase 3:** Supabase login UI + frontend v3.1 wiring + VPS deploy.
- Real Apify/Xpoz scraper + real AI key wiring (env-var change, confirm field/model names at that point).
