import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAuth } from './auth.js';
import { createApiClient, AuthError } from './api-client.js';
import { computePortfolio, computeExitLevels, nextTarget } from './portfolio.js';
import { deriveComponents, computeSignal } from './signal.js';
import { debounce } from './utils.js';

const cfg = window.APP_CONFIG || {};
const auth = createAuth({ createClient, supabaseUrl: cfg.supabaseUrl, anonKey: cfg.anonKey });
const api = createApiClient({ baseUrl: cfg.apiBaseUrl, getToken: auth.getToken });

const $ = (id) => document.getElementById(id);

// ── Portfolio persistence (localStorage per user) ──
const PORTFOLIO_KEY = (uid) => `oct_portfolio_${uid}`;

function savePortfolio(uid) {
  if (!uid) return;
  const amt = $('oct-amt')?.value || '';
  const avg = $('avg-buy')?.value || '';
  localStorage.setItem(PORTFOLIO_KEY(uid), JSON.stringify({ amt, avg }));
}

function loadPortfolio(uid) {
  if (!uid) return;
  try {
    const raw = localStorage.getItem(PORTFOLIO_KEY(uid));
    if (!raw) return;
    const { amt, avg } = JSON.parse(raw);
    if ($('oct-amt') && amt) $('oct-amt').value = amt;
    if ($('avg-buy') && avg) $('avg-buy').value = avg;
    renderPortfolio();
  } catch { /* ignore */ }
}

// F4: recompute portfolio/exits as the user edits amount or avg-buy.
['oct-amt', 'avg-buy'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => {
    debouncedRenderPortfolio();
    auth.getUser()
      .then((u) => { if (u) savePortfolio(u.id); })
      .catch((error) => {
        console.error('[Portfolio] Failed to restore portfolio from auth:', error.message);
        // User can still use app with empty portfolio, just won't be persisted
      });
  });
});

const overlay = $('login-overlay');
const loginForm = $('login-form');
const loginError = $('login-error');

function showLogin(msg) { if (overlay) overlay.style.display = 'flex'; if (loginError) loginError.textContent = msg || ''; }
function hideLogin() { if (overlay) overlay.style.display = 'none'; }

// ── Mappers: backend response shapes → shapes the inline renderers expect ──

// Tweet sentiment (Bullish/Bearish/Whale/Unrated) → renderer's positive/negative/neutral + tag.
function mapTweets(tweets) {
  return tweets.map((t) => {
    const sent = String(t.sentiment || '').toLowerCase();
    let sentiment = 'neutral';
    let tag = 'all';
    if (sent === 'bullish') sentiment = 'positive';
    else if (sent === 'bearish') sentiment = 'negative';
    else if (sent === 'whale') { sentiment = 'positive'; tag = 'whale'; }
    const handle = t.author ? (t.author.startsWith('@') ? t.author : '@' + t.author) : '@unknown';
    return {
      handle,
      name: t.author || 'Unknown',
      text: t.text || '',
      likes: 0,
      retweets: 0,
      time: t.createdAt ? ago(new Date(t.createdAt)) : '',
      sentiment,
      tag,
      url: t.url,
      avatar_letter: (handle[1] || '?').toUpperCase(),
    };
  });
}

// News: backend {title,url,source(string),publishedAt,sentiment} → renderer reads votes/source.title/published_at.
function mapNews(items) {
  return items.map((n) => {
    const sent = String(n.sentiment || '').toLowerCase();
    let votes = {};
    if (sent === 'positive' || sent === 'bullish') votes = { positive: 2 };
    else if (sent === 'negative' || sent === 'bearish') votes = { negative: 2 };
    return {
      title: n.title,
      url: n.url,
      source: { title: n.source || 'News' },
      published_at: n.publishedAt,
      votes,
    };
  });
}

// ago(): local copy (the inline ago() is not exposed on window).
function ago(d) {
  const s = Math.floor((Date.now() - d) / 1000);
  if (isNaN(s)) return '';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// ── F4: Portfolio + exit-plan tracker (pure math in portfolio.js) ──
// Track price freshness separately with staleness detection
let lastPrice = {
  value: null,
  fetchedAt: null,
  get staleSinceMs() {
    return this.fetchedAt ? Date.now() - this.fetchedAt : 0;
  },
  get isStale() {
    return this.staleSinceMs > 10 * 60 * 1000; // 10 minutes
  },
};

function fmtMoney(n) { return n == null ? '—' : (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toFixed(2)); }

function renderPortfolio() {
  const amount = parseFloat(document.getElementById('oct-amt')?.value) || 0;
  const avgBuy = parseFloat(document.getElementById('avg-buy')?.value) || 0;
  const price = lastPrice.value || 0;
  const { value, pnl, pnlPct } = computePortfolio({ amount, avgBuy, price });
  const set = (id, txt, color) => { const el = document.getElementById(id); if (el) { if (txt != null) el.textContent = txt; if (color) el.style.color = color; } };
  set('pv', value != null ? '$' + fmtMoney(value) : '—');
  if (pnl != null) {
    set('ppnl', (pnl >= 0 ? '+$' : '-$') + fmtMoney(Math.abs(pnl)), pnl >= 0 ? 'var(--green)' : 'var(--red)');
    set('ppnlp', (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(1) + '%', pnl >= 0 ? 'var(--green)' : 'var(--red)');
  }
  const nxt = nextTarget({ price });
  if (nxt) set('pnxt', '$' + nxt.p + ' — ' + nxt.lbl.split('—')[1].trim());
  // value realised by selling the T2 tranche (20% at $0.40)
  set('pt2', amount > 0 ? '$' + fmtMoney(amount * 0.40 * 0.20) : '—');

  // Mark price element as stale if data is old
  const priceEl = document.getElementById('prc');
  if (priceEl) {
    if (lastPrice.isStale && lastPrice.value) {
      priceEl.classList.add('stale-data');
      priceEl.title = `Last updated ${Math.round(lastPrice.staleSinceMs / 1000)}s ago`;
    } else {
      priceEl.classList.remove('stale-data');
    }
  }

  const exits = document.getElementById('exits');
  if (exits) {
    exits.innerHTML = computeExitLevels({ price, amount }).map((l) => {
      const cls = l.status === 'done' ? 'exit-row done' : l.status === 'current' ? 'exit-row cur' : 'exit-row';
      const icon = l.status === 'done' ? '✅' : l.status === 'current' ? '⚡' : '○';
      const sa = l.sellAmount != null ? `<span style="color:var(--accent);font-size:8px">~${l.sellAmount} OCT</span>` : '';
      return `<div class="${cls}"><span>${icon}</span><span style="font-weight:700;width:44px;font-size:10px">$${l.p}</span><span style="color:var(--accent2);width:26px;font-size:8px">${l.pct}%</span><span style="color:var(--muted2);flex:1;font-size:9px">${l.lbl}</span>${sa}</div>`;
    }).join('');
  }
}

// Debounced render to prevent DOM thrashing from simultaneous input + refresh events
const debouncedRenderPortfolio = debounce(() => {
  renderPortfolio();
}, 200);

function renderPrice(p) {
  if (!p || p.pending) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.textContent = val; };
  set('prc', p.oct != null ? `$${p.oct}` : '—');
  set('chg', p.octChange24h != null ? `${parseFloat(p.octChange24h).toFixed(2)}%` : '—');
  set('psub', p.octChange24h != null ? `${parseFloat(p.octChange24h).toFixed(2)}% · 24h Change` : 'Loading...');
  set('btcp', p.btc != null ? `$${p.btc}` : '—');
  set('ethp', p.eth != null ? `$${p.eth}` : '—');
  set('btcv', p.btc != null ? `$${p.btc}` : '—');
  set('btcc', p.btcChange24h != null ? `${parseFloat(p.btcChange24h).toFixed(2)}%` : '—');
  set('ethv', p.eth != null ? `$${p.eth}` : '—');
  set('pvol', p.octVolume24h != null ? `$${fmtMoney(p.octVolume24h)}` : '—');
  set('fib-current-ref', p.oct != null ? `$${p.oct}` : '—');
  // Keep module-scoped CUR_PRICE in sync (drives calcFib / calcPort / buildExits).
  if (typeof window.setPrice === 'function') window.setPrice(p.oct);
  // Update lastPrice with fresh timestamp
  if (p.oct != null) {
    lastPrice.value = p.oct;
    lastPrice.fetchedAt = Date.now();
  }
}

function renderAnalysis(a) {
  const el = $('ai-txt');
  if (el && a) {
    el.classList.remove('ld');
    el.style.color = 'var(--text)';
    const parts = [];
    if (a.recommendation) parts.push(String(a.recommendation).toUpperCase());
    if (a.confidence != null) parts.push(`(${a.confidence}% confidence)`);
    const head = parts.length ? parts.join(' ') + ' — ' : '';
    el.textContent = head + (a.summary || '');
  }
}

// ── F5: Signal scores (pure engine in signal.js) ──
function readFib() {
  const low = parseFloat(document.getElementById('fib-low')?.value);
  const high = parseFloat(document.getElementById('fib-high')?.value);
  return (low > 0 && high > low) ? { low, high } : null;
}

function setComponentBar(barId, numId, value) {
  const v = Math.round(value);
  const bar = document.getElementById(barId);
  if (bar) bar.style.width = v + '%';
  const num = document.getElementById(numId);
  if (num) num.textContent = v;
}

function renderSignal({ price, tweets, news }) {
  const components = deriveComponents({
    priceChange: price && !price.pending ? price.octChange24h : 0,
    price: price && !price.pending ? price.oct : 0,
    tweets: Array.isArray(tweets) ? tweets : [],
    news: Array.isArray(news) ? news : [],
    fib: readFib(),
  });
  const { score, recommendation } = computeSignal(components);
  const sig = document.getElementById('msig');
  if (sig) { sig.textContent = recommendation; sig.className = 'sv ' + recommendation; }
  const card = document.getElementById('scrd');
  if (card) card.className = 'sb sig-card ' + recommendation;
  const conf = document.getElementById('mconf');
  if (conf) conf.textContent = 'Score: ' + score + '/100 · ' + new Date().toLocaleTimeString('id-ID');
  // Component score bars (ids confirmed in index.html top-row "SIGNAL SCORES").
  setComponentBar('bp', 'np', components.priceAction);
  setComponentBar('bs', 'ns', components.sentiment);
  setComponentBar('bt', 'nt', components.twitterBuzz);
  setComponentBar('bf', 'nf', components.fibonacci);
}

function showStalePriceWarning(staleSinceMs) {
  let warning = document.querySelector('[data-test="stale-price-warning"]');
  if (!warning) {
    warning = document.createElement('div');
    warning.setAttribute('data-test', 'stale-price-warning');
    warning.className = 'warning-banner';
    const portfolio = document.querySelector('.portfolio');
    if (portfolio) portfolio.prepend(warning);
  }
  warning.textContent = `⚠️ Price data is stale (${Math.round(staleSinceMs / 1000)}s old)`;
  warning.style.display = 'block';
}

function hideStalePriceWarning() {
  const warning = document.querySelector('[data-test="stale-price-warning"]');
  if (warning) warning.style.display = 'none';
}

async function refresh() {
  let priceError = null;
  let price = null;

  // Fetch price independently from tweets
  try {
    price = await api.getPrice();
    if (price && !price.pending) {
      renderPrice(price);
    }
  } catch (error) {
    priceError = error;
    console.error('[Price] Fetch failed, keeping stale value:', error.message);
  }

  // Fetch tweets independently
  try {
    const tweets = await api.getTweets();
    // setTweets sets ALL_TWEETS (so filter buttons work) + renders + updates stats.
    if (!tweets.pending) {
      if (typeof window.setTweets === 'function') window.setTweets(mapTweets(tweets));
      else if (window.renderTweets) window.renderTweets(mapTweets(tweets));
    }
  } catch (error) {
    console.error('[Tweets] Fetch failed:', error.message);
  }

  // Fetch news independently
  let news = [];
  try {
    const newsResult = await api.getNews();
    // Validate response is an array before mapping
    if (!Array.isArray(newsResult)) {
      console.warn('[News] Backend returned non-array response:', newsResult);
      if (newsResult && newsResult.error) {
        console.warn('[News] Error from backend:', newsResult.error);
      }
      news = [];
    } else {
      news = newsResult;
    }
    if (!news.pending && window.renderNews) window.renderNews(mapNews(news));
  } catch (error) {
    console.error('[News] Fetch failed:', error.message);
  }

  // Always render portfolio and signal with current state (using stale price if necessary)
  debouncedRenderPortfolio();

  // F5: signal scores from signal.js (uses raw backend sentiment fields + Fib inputs).
  try {
    const tweets = Array.isArray(window.ALL_TWEETS) ? window.ALL_TWEETS : [];
    renderSignal({ price, tweets, news });
  } catch (error) {
    console.error('[Signal] Computation failed:', error.message);
  }

  // Show staleness warning if price is stale
  if (lastPrice.isStale && lastPrice.value) {
    showStalePriceWarning(lastPrice.staleSinceMs);
  } else {
    hideStalePriceWarning();
  }

  // Only re-throw auth errors; partial failures are logged and handled gracefully
  if (priceError instanceof AuthError) {
    await auth.logout();
    showLogin('Session expired — sign in again.');
  }
}

// ── Admin: show/hide Add User button based on logged-in email ──
const ADMIN_EMAILS = ['admin@admin.com']; // sync with server ADMIN_EMAILS env

async function setupAdminUI() {
  try {
    const user = await auth.getUser();
    const btn = $('admin-add-user-btn');
    if (btn && user && ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
      btn.style.display = 'inline-flex';
    }
    if (user) loadPortfolio(user.id);
  } catch (error) {
    console.error('[Portfolio] Auth failed during admin setup:', error.message);
    // Continue gracefully — user will see login overlay or empty portfolio
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await auth.login($('login-email').value, $('login-password').value);
      hideLogin();
      loadTgStatus();
      await setupAdminUI();
      await refresh();
    }
    catch (err) { showLogin(err.message || 'Login failed'); }
  });
}
const logoutBtn = $('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', async () => { await auth.logout(); showLogin(); });

// ── Telegram modal ──
const tgModalBg = $('tg-modal-bg');
const tgBtn = $('tg-btn');
const tgClose = $('tg-close');
const tgSaveBtn = $('tg-save-btn');
const tgInput = $('tg-chatid-input');
const tgNameInput = $('tg-name-input');
const tgStatus = $('tg-status');
const tgMsg = $('tg-msg');
const tgChip = $('tg-chip');

function setTgStatus(connected, chatId, name) {
  if (!tgStatus) return;
  if (connected) {
    tgStatus.textContent = `CONNECTED · ${chatId}`;
    tgStatus.className = 'tg-modal-status connected';
    if (tgInput) tgInput.value = chatId;
    if (tgNameInput) tgNameInput.value = name || '';
    if (tgChip) {
      tgChip.textContent = name ? `● ${name} · ${chatId}` : `● ${chatId}`;
      tgChip.style.display = '';
    }
    if (tgBtn) tgBtn.classList.add('connected');
  } else {
    tgStatus.textContent = 'NOT CONNECTED';
    tgStatus.className = 'tg-modal-status disconnected';
    if (tgChip) tgChip.style.display = 'none';
    if (tgBtn) tgBtn.classList.remove('connected');
  }
}

async function loadTgStatus() {
  try {
    const data = await api.getTelegramStatus();
    setTgStatus(data.connected, data.chatId, data.name);
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
    const name = tgNameInput?.value?.trim() || null;
    if (!chatId) {
      if (tgMsg) { tgMsg.textContent = 'Enter your Chat ID first.'; tgMsg.className = 'tg-msg err'; }
      return;
    }
    if (!/^-?\d{1,20}$/.test(chatId)) {
      if (tgMsg) { tgMsg.textContent = 'Chat ID must be numeric (e.g. 123456789).'; tgMsg.className = 'tg-msg err'; }
      return;
    }
    tgSaveBtn.disabled = true;
    if (tgMsg) tgMsg.textContent = '';
    try {
      await api.saveTelegramChatId(chatId, name);
      setTgStatus(true, chatId, name);
      if (tgMsg) { tgMsg.textContent = 'Connected! You will receive BUY/SELL alerts.'; tgMsg.className = 'tg-msg ok'; }
    } catch (err) {
      if (tgMsg) { tgMsg.textContent = 'Failed to save. Try again.'; tgMsg.className = 'tg-msg err'; }
    } finally {
      tgSaveBtn.disabled = false;
    }
  });
}

const refreshBtn = $('rbtn');
if (refreshBtn) refreshBtn.addEventListener('click', refresh);

// Save portfolio as image
const saveImgBtn = $('save-img-btn');
if (saveImgBtn) {
  saveImgBtn.addEventListener('click', async () => {
    const target = document.getElementById('portfolio-capture');
    if (!target || !window.html2canvas) return;
    saveImgBtn.textContent = '⏳';
    try {
      const canvas = await window.html2canvas(target, {
        backgroundColor: '#0a0a0f',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      const ts = new Date().toISOString().slice(0,16).replace('T','_').replace(':','-');
      link.download = `OCT-portfolio-${ts}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('save image failed:', e);
    } finally {
      saveImgBtn.textContent = '📷 SAVE';
    }
  });
}

const analyzeBtn = $('analyze-btn');
const analyzeStatus = $('analyze-status');
if (analyzeBtn) {
  analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '⏳ ANALYZING...';
    if (analyzeStatus) analyzeStatus.textContent = 'Sedang menganalisa...';
    const aiTxt = $('ai-txt');
    if (aiTxt) { aiTxt.style.color = 'var(--muted)'; aiTxt.textContent = 'Menganalisa OCT + Fibonacci + Twitter...'; }
    try {
      const analysis = await api.analyze({ force: true });
      if (!analysis.pending) renderAnalysis(analysis);
      if (analyzeStatus) analyzeStatus.textContent = 'Terakhir: ' + new Date().toLocaleTimeString('id-ID');
    } catch (err) {
      if (analyzeStatus) analyzeStatus.textContent = 'Gagal — coba lagi';
      console.error('analyze error:', err);
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = '▶ ANALYZE';
    }
  });
}

// ── Admin: Add User modal ──
const adminAddBtn = $('admin-add-user-btn');
const adminModal = $('admin-modal');
const adminModalClose = $('admin-modal-close');
const adminInviteForm = $('admin-invite-form');
const adminInviteMsg = $('admin-invite-msg');

if (adminAddBtn) adminAddBtn.addEventListener('click', () => { if (adminModal) adminModal.style.display = 'flex'; });
if (adminModalClose) adminModalClose.addEventListener('click', () => { if (adminModal) adminModal.style.display = 'none'; });
if (adminModal) adminModal.addEventListener('click', (e) => { if (e.target === adminModal) adminModal.style.display = 'none'; });

if (adminInviteForm) {
  adminInviteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('new-user-email')?.value?.trim();
    const password = $('new-user-password')?.value;
    if (!email || !password) return;
    if (adminInviteMsg) { adminInviteMsg.style.color = 'var(--muted)'; adminInviteMsg.textContent = 'Menambahkan user...'; }
    try {
      await api.adminInvite({ email, password });
      if (adminInviteMsg) { adminInviteMsg.style.color = 'var(--green)'; adminInviteMsg.textContent = `✓ User ${email} berhasil ditambahkan!`; }
      adminInviteForm.reset();
    } catch (err) {
      if (adminInviteMsg) { adminInviteMsg.style.color = 'var(--red)'; adminInviteMsg.textContent = err.message || 'Gagal menambahkan user'; }
    }
  });
}

(async function init() {
  if (!auth.isConfigured) { showLogin('Supabase not configured — see frontend/README.md'); return; }
  const token = await auth.getToken();
  if (token) { hideLogin(); loadTgStatus(); await setupAdminUI(); renderPortfolio(); await refresh(); setInterval(refresh, 10_000); } else { showLogin(); }
})();
