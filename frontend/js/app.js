import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAuth } from './auth.js';
import { createApiClient, AuthError } from './api-client.js';
import { computePortfolio, computeExitLevels, nextTarget } from './portfolio.js';
import { deriveComponents, computeSignal } from './signal.js';

const cfg = window.APP_CONFIG || {};
const auth = createAuth({ createClient, supabaseUrl: cfg.supabaseUrl, anonKey: cfg.anonKey });
const api = createApiClient({ baseUrl: cfg.apiBaseUrl, getToken: auth.getToken });

const $ = (id) => document.getElementById(id);

// F4: recompute portfolio/exits as the user edits amount or avg-buy.
['oct-amt', 'avg-buy'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', renderPortfolio);
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
let lastPrice = null;

function fmtMoney(n) { return n == null ? '—' : (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toFixed(2)); }

function renderPortfolio() {
  const amount = parseFloat(document.getElementById('oct-amt')?.value) || 0;
  const avgBuy = parseFloat(document.getElementById('avg-buy')?.value) || 0;
  const price = lastPrice || 0;
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

function renderPrice(p) {
  if (!p || p.pending) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.textContent = val; };
  set('prc', p.oct != null ? `$${p.oct}` : '—');
  set('chg', p.octChange24h != null ? `${p.octChange24h}%` : '—');
  set('btcp', p.btc != null ? `$${p.btc}` : '—');
  set('ethp', p.eth != null ? `$${p.eth}` : '—');
  set('btcv', p.btc != null ? `$${p.btc}` : '—');
  set('btcc', p.btcChange24h != null ? `${p.btcChange24h}%` : '—');
  set('ethv', p.eth != null ? `$${p.eth}` : '—');
  set('fib-current-ref', p.oct != null ? `$${p.oct}` : '—');
  // Keep module-scoped CUR_PRICE in sync (drives calcFib / calcPort / buildExits).
  if (typeof window.setPrice === 'function') window.setPrice(p.oct);
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

async function refresh() {
  try {
    const price = await api.getPrice();
    renderPrice(price);
    lastPrice = (price && !price.pending) ? price.oct : lastPrice;
    renderPortfolio();

    const news = await api.getNews();
    if (!news.pending && window.renderNews) window.renderNews(mapNews(news));

    const tweets = await api.getTweets();
    // setTweets sets ALL_TWEETS (so filter buttons work) + renders + updates stats.
    if (!tweets.pending) {
      if (typeof window.setTweets === 'function') window.setTweets(mapTweets(tweets));
      else if (window.renderTweets) window.renderTweets(mapTweets(tweets));
    }

    // F5: signal scores from signal.js (uses raw backend sentiment fields + Fib inputs).
    renderSignal({ price, tweets, news });

    // analysis is manual — triggered by ANALYZE button only
  } catch (err) {
    if (err instanceof AuthError) { await auth.logout(); showLogin('Session expired — sign in again.'); }
    else { console.error('refresh failed:', err); }
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await auth.login($('login-email').value, $('login-password').value); hideLogin(); await refresh(); }
    catch (err) { showLogin(err.message || 'Login failed'); }
  });
}
const logoutBtn = $('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', async () => { await auth.logout(); showLogin(); });
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

(async function init() {
  if (!auth.isConfigured) { showLogin('Supabase not configured — see frontend/README.md'); return; }
  const token = await auth.getToken();
  if (token) { hideLogin(); renderPortfolio(); await refresh(); setInterval(refresh, 60_000); } else { showLogin(); }
})();
