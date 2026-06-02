# Telegram Manual Chat ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users connect their Telegram account by manually entering their Chat ID in the dashboard, enabling BUY/SELL signal notifications via Telegram.

**Architecture:** Two new protected REST endpoints (`GET /api/telegram/status`, `PUT /api/telegram/chatid`) are added to the existing `routes/telegram.js`. The frontend gets a "TELEGRAM" button in the header that opens a modal where the user can view connection status and save their Chat ID.

**Tech Stack:** Node.js/Express (backend), vanilla JS ES modules (frontend), better-sqlite3, vitest + supertest (tests)

---

## File Map

| File | Change |
|---|---|
| `backend/src/routes/telegram.js` | Add `GET /status` and `PUT /chatid` to `protectedRouter` |
| `backend/tests/routes/telegram.test.js` | Add test suites for the two new endpoints |
| `frontend/js/api-client.js` | Add `getTelegramStatus()` and `saveTelegramChatId(chatId)` |
| `frontend/index.html` | Add modal CSS, TELEGRAM button in header, modal HTML |
| `frontend/js/app.js` | Add modal open/close/save/status-load logic |

---

## Task 1: Backend — GET /api/telegram/status and PUT /api/telegram/chatid

**Files:**
- Modify: `backend/src/routes/telegram.js`
- Modify: `backend/tests/routes/telegram.test.js`

- [ ] **Step 1: Write failing tests for GET /api/telegram/status**

Add this describe block at the bottom of `backend/tests/routes/telegram.test.js`:

```js
describe('GET /api/telegram/status', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createDb(':memory:');
    app = makeApp(db);
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('user-123', 'test@example.com');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/telegram/status');
    expect(res.status).toBe(401);
  });

  it('returns connected: false when no chatId saved', async () => {
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .get('/api/telegram/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
    expect(res.body.chatId).toBeNull();
  });

  it('returns connected: true with chatId when saved', async () => {
    db.prepare('UPDATE users SET telegramChatId = ? WHERE id = ?').run('987654321', 'user-123');
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .get('/api/telegram/status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.chatId).toBe('987654321');
  });
});
```

- [ ] **Step 2: Write failing tests for PUT /api/telegram/chatid**

Append after the GET describe block:

```js
describe('PUT /api/telegram/chatid', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createDb(':memory:');
    app = makeApp(db);
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('user-123', 'test@example.com');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).put('/api/telegram/chatid').send({ chatId: '123456' });
    expect(res.status).toBe(401);
  });

  it('returns 400 if chatId is missing', async () => {
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .put('/api/telegram/chatid')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_chat_id');
  });

  it('returns 400 if chatId is not numeric', async () => {
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .put('/api/telegram/chatid')
      .set('Authorization', `Bearer ${token}`)
      .send({ chatId: 'not-a-number' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_chat_id');
  });

  it('returns 400 if chatId exceeds 20 characters', async () => {
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .put('/api/telegram/chatid')
      .set('Authorization', `Bearer ${token}`)
      .send({ chatId: '123456789012345678901' }); // 21 digits
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_chat_id');
  });

  it('saves chatId and returns success', async () => {
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .put('/api/telegram/chatid')
      .set('Authorization', `Bearer ${token}`)
      .send({ chatId: '987654321' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const user = db.prepare('SELECT telegramChatId FROM users WHERE id = ?').get('user-123');
    expect(user.telegramChatId).toBe('987654321');
  });

  it('overwrites a previously saved chatId', async () => {
    db.prepare('UPDATE users SET telegramChatId = ? WHERE id = ?').run('111111111', 'user-123');
    const token = signTestToken({ sub: 'user-123' });
    const res = await request(app)
      .put('/api/telegram/chatid')
      .set('Authorization', `Bearer ${token}`)
      .send({ chatId: '999999999' });
    expect(res.status).toBe(200);
    const user = db.prepare('SELECT telegramChatId FROM users WHERE id = ?').get('user-123');
    expect(user.telegramChatId).toBe('999999999');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```
cd backend && npx vitest run tests/routes/telegram.test.js
```

Expected: new test suites fail with "cannot GET/PUT /api/telegram/status|chatid" or 404.

- [ ] **Step 4: Implement GET /api/telegram/status and PUT /api/telegram/chatid**

In `backend/src/routes/telegram.js`, add these two routes to `protectedRouter` (before the `validateCode`/`invalidateCode` exports, around line 130):

```js
  /**
   * GET /api/telegram/status
   * Returns whether the current user has a Telegram chatId saved
   */
  protectedRouter.get('/status', (req, res) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const user = db.prepare('SELECT telegramChatId FROM users WHERE id = ?').get(req.user.id);
    const chatId = user?.telegramChatId || null;
    res.json({ connected: !!chatId, chatId });
  });

  /**
   * PUT /api/telegram/chatid
   * Saves a manually-entered Telegram chatId for the current user
   */
  protectedRouter.put('/chatid', (req, res) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const { chatId } = req.body;
    if (!chatId) {
      return res.status(400).json({ error: 'missing_chat_id' });
    }
    if (!/^\-?\d{1,20}$/.test(String(chatId))) {
      return res.status(400).json({ error: 'invalid_chat_id' });
    }
    try {
      db.prepare('UPDATE users SET telegramChatId = ? WHERE id = ?').run(String(chatId), req.user.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving telegram chatId:', error);
      res.status(500).json({ error: 'internal_error' });
    }
  });
```

Note: The regex `^\-?\d{1,20}$` allows an optional leading `-` (Telegram private chat IDs can be negative for groups) plus 1–20 digits.

- [ ] **Step 5: Run tests to verify they pass**

```
cd backend && npx vitest run tests/routes/telegram.test.js
```

Expected: all tests PASS (including pre-existing ones).

- [ ] **Step 6: Run full backend test suite**

```
cd backend && npx vitest run
```

Expected: all 88+ tests pass, no regressions.

- [ ] **Step 7: Commit**

```
git add backend/src/routes/telegram.js backend/tests/routes/telegram.test.js
git commit -m "feat: add GET /api/telegram/status and PUT /api/telegram/chatid endpoints"
```

---

## Task 2: Frontend — Telegram modal (HTML + CSS)

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add modal CSS**

In `frontend/index.html`, find the `/* AI */` CSS section (around line 105). Insert this CSS block **before** it:

```css
/* TELEGRAM MODAL */
.tg-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;display:none;align-items:center;justify-content:center}
.tg-modal-bg.open{display:flex}
.tg-modal{background:var(--surface);border:1px solid var(--accent);padding:22px 24px;min-width:300px;max-width:420px;width:90%;position:relative}
.tg-modal h3{font-family:var(--ui);font-size:13px;font-weight:700;color:var(--accent);letter-spacing:2px;text-transform:uppercase;margin-bottom:14px}
.tg-modal p{font-size:10px;color:var(--muted2);line-height:1.65;margin-bottom:12px}
.tg-modal p a{color:var(--accent);text-decoration:none}
.tg-modal p a:hover{text-decoration:underline}
.tg-modal label{font-size:8px;color:var(--muted);letter-spacing:1px;display:block;margin-bottom:4px;text-transform:uppercase}
.tg-modal input{background:var(--s3);border:1px solid var(--border);color:var(--text);font-family:var(--font);font-size:12px;padding:6px 10px;width:100%;outline:none;margin-bottom:12px;transition:.2s}
.tg-modal input:focus{border-color:var(--accent)}
.tg-modal-status{font-size:9px;padding:5px 10px;margin-bottom:12px;letter-spacing:1px;display:inline-block}
.tg-modal-status.connected{color:var(--green);border:1px solid rgba(0,255,136,.3);background:rgba(0,255,136,.05)}
.tg-modal-status.disconnected{color:var(--muted);border:1px solid var(--border)}
.tg-modal-actions{display:flex;gap:8px;justify-content:flex-end}
.tg-close{position:absolute;top:10px;right:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;font-family:var(--font);line-height:1}
.tg-close:hover{color:var(--text)}
.tg-msg{font-size:9px;margin-top:8px;min-height:14px;letter-spacing:.5px}
.tg-msg.ok{color:var(--green)}.tg-msg.err{color:var(--red)}
```

- [ ] **Step 2: Add TELEGRAM button to header**

Find the header `<div style="margin-left:auto...">` block (around line 333). Add the TELEGRAM button before `#admin-add-user-btn`:

```html
    <button id="tg-btn" style="font-size:9px;padding:4px 10px;background:transparent;border:1px solid rgba(0,229,255,.4);color:var(--accent);cursor:pointer;font-family:var(--font);letter-spacing:1px">TELEGRAM</button>
```

After this change the header block looks like:

```html
  <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
    <button id="tg-btn" style="font-size:9px;padding:4px 10px;background:transparent;border:1px solid rgba(0,229,255,.4);color:var(--accent);cursor:pointer;font-family:var(--font);letter-spacing:1px">TELEGRAM</button>
    <button id="admin-add-user-btn" style="display:none;font-size:9px;padding:4px 10px;background:transparent;border:1px solid var(--yellow);color:var(--yellow);cursor:pointer">+ ADD USER</button>
    <button id="logout-btn" style="font-size:9px;padding:4px 10px;background:transparent;border:1px solid #243049;color:#8aa0c0;cursor:pointer">LOGOUT</button>
  </div>
```

- [ ] **Step 3: Add modal HTML**

Find `<!-- HEADER -->` in the HTML. Insert the modal **before** the `<header>` tag:

```html
<!-- TELEGRAM MODAL -->
<div class="tg-modal-bg" id="tg-modal-bg">
  <div class="tg-modal">
    <button class="tg-close" id="tg-close">✕</button>
    <h3>Telegram Notifications</h3>
    <div id="tg-status" class="tg-modal-status disconnected">NOT CONNECTED</div>
    <p>
      Dapatkan sinyal BUY/SELL langsung di Telegram.<br>
      Caranya: chat <a href="https://t.me/userinfobot" target="_blank">@userinfobot</a> →
      bot akan balas dengan Chat ID kamu → paste di bawah.
    </p>
    <label for="tg-chatid-input">CHAT ID</label>
    <input type="text" id="tg-chatid-input" placeholder="e.g. 123456789" maxlength="21" inputmode="numeric">
    <div class="tg-modal-actions">
      <button class="btn" id="tg-save-btn">SAVE</button>
    </div>
    <div class="tg-msg" id="tg-msg"></div>
  </div>
</div>
```

- [ ] **Step 4: Verify HTML renders correctly (visual check)**

Open `frontend/index.html` in a browser (or check structure). Confirm:
- TELEGRAM button visible in header
- Clicking it should not yet work (JS not wired)
- Modal HTML exists in DOM (hidden by default)

---

## Task 3: Frontend — Wire Telegram modal logic in app.js and api-client.js

**Files:**
- Modify: `frontend/js/api-client.js`
- Modify: `frontend/js/app.js`

- [ ] **Step 1: Add API methods to api-client.js**

In `frontend/js/api-client.js`, add two methods to the returned object (after `adminInvite`):

```js
    getTelegramStatus: () => call('/api/telegram/status'),
    saveTelegramChatId: (chatId) =>
      call('/api/telegram/chatid', { method: 'PUT', body: JSON.stringify({ chatId }) }),
```

Full updated return object:

```js
  return {
    getPrice: () => call('/api/price'),
    getNews: () => call('/api/news'),
    getTweets: () => call('/api/tweets'),
    analyze: ({ force = false } = {}) =>
      call('/api/analyze', { method: 'POST', body: JSON.stringify({ force }) }),
    adminInvite: ({ email, password }) =>
      call('/api/admin/invite', { method: 'POST', body: JSON.stringify({ email, password }) }),
    getTelegramStatus: () => call('/api/telegram/status'),
    saveTelegramChatId: (chatId) =>
      call('/api/telegram/chatid', { method: 'PUT', body: JSON.stringify({ chatId }) }),
  };
```

- [ ] **Step 2: Add Telegram modal logic to app.js**

In `frontend/js/app.js`, find the section where `logout-btn` logic is wired (search for `logout-btn`). Add the following Telegram modal logic block right after the logout section:

```js
// ── Telegram modal ──
const tgModalBg = $('tg-modal-bg');
const tgBtn = $('tg-btn');
const tgClose = $('tg-close');
const tgSaveBtn = $('tg-save-btn');
const tgInput = $('tg-chatid-input');
const tgStatus = $('tg-status');
const tgMsg = $('tg-msg');

function setTgStatus(connected, chatId) {
  if (connected) {
    tgStatus.textContent = `CONNECTED · ${chatId}`;
    tgStatus.className = 'tg-modal-status connected';
    if (tgInput) tgInput.value = chatId;
  } else {
    tgStatus.textContent = 'NOT CONNECTED';
    tgStatus.className = 'tg-modal-status disconnected';
  }
}

async function loadTgStatus() {
  try {
    const data = await api.getTelegramStatus();
    setTgStatus(data.connected, data.chatId);
  } catch { /* silent — user not logged in yet or network error */ }
}

if (tgBtn) {
  tgBtn.addEventListener('click', () => {
    if (tgModalBg) tgModalBg.classList.add('open');
    if (tgMsg) tgMsg.textContent = '';
    loadTgStatus();
  });
}

if (tgClose) {
  tgClose.addEventListener('click', () => tgModalBg?.classList.remove('open'));
}

if (tgModalBg) {
  tgModalBg.addEventListener('click', (e) => {
    if (e.target === tgModalBg) tgModalBg.classList.remove('open');
  });
}

if (tgSaveBtn) {
  tgSaveBtn.addEventListener('click', async () => {
    const chatId = tgInput?.value?.trim();
    if (!chatId) {
      tgMsg.textContent = 'Enter your Chat ID first.';
      tgMsg.className = 'tg-msg err';
      return;
    }
    if (!/^\-?\d{1,20}$/.test(chatId)) {
      tgMsg.textContent = 'Chat ID must be numeric (e.g. 123456789).';
      tgMsg.className = 'tg-msg err';
      return;
    }
    tgSaveBtn.disabled = true;
    tgMsg.textContent = '';
    try {
      await api.saveTelegramChatId(chatId);
      setTgStatus(true, chatId);
      tgMsg.textContent = 'Connected! You will receive BUY/SELL alerts.';
      tgMsg.className = 'tg-msg ok';
    } catch (err) {
      tgMsg.textContent = 'Failed to save. Try again.';
      tgMsg.className = 'tg-msg err';
    } finally {
      tgSaveBtn.disabled = false;
    }
  });
}
```

- [ ] **Step 3: Load Telegram status on login**

In `app.js`, find the place where the app initializes after a successful login (search for `hideLogin` or the post-login data fetch). Call `loadTgStatus()` there so the button reflects current connection state when the dashboard loads.

Find the section that calls `hideLogin()` and starts data fetching (typically inside the auth state handler or `init` function). After `hideLogin()` is called and the user is confirmed logged in, add:

```js
loadTgStatus();
```

- [ ] **Step 4: Commit**

```
git add frontend/index.html frontend/js/api-client.js frontend/js/app.js
git commit -m "feat: add Telegram manual Chat ID connect modal to dashboard"
```

---

## Task 4: End-to-end smoke test

- [ ] **Step 1: Start backend**

```
cd backend && node src/server.js
```

Expected: server running on port 3000, no errors.

- [ ] **Step 2: Test GET /api/telegram/status with curl**

```
TOKEN=<your-jwt>
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/telegram/status
```

Expected: `{"connected":false,"chatId":null}`

- [ ] **Step 3: Test PUT /api/telegram/chatid with curl**

```
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"chatId":"123456789"}' \
  http://localhost:3000/api/telegram/chatid
```

Expected: `{"success":true}`

- [ ] **Step 4: Verify status now shows connected**

```
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/telegram/status
```

Expected: `{"connected":true,"chatId":"123456789"}`

- [ ] **Step 5: Open dashboard, click TELEGRAM, verify modal**

- Modal opens with "CONNECTED · 123456789" status
- Changing Chat ID and clicking SAVE updates the status
- Clicking outside modal or ✕ closes it

- [ ] **Step 6: Run full test suite one last time**

```
cd backend && npx vitest run
```

Expected: all tests pass.
