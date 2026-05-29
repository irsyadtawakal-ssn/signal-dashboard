import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAuth } from './auth.js';
import { createApiClient, AuthError } from './api-client.js';

const cfg = window.APP_CONFIG || {};
const auth = createAuth({ createClient, supabaseUrl: cfg.supabaseUrl, anonKey: cfg.anonKey });
const api = createApiClient({ baseUrl: cfg.apiBaseUrl, getToken: auth.getToken });

const $ = (id) => document.getElementById(id);
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
    const parts = [];
    if (a.recommendation) parts.push(String(a.recommendation).toUpperCase());
    if (a.confidence != null) parts.push(`(${a.confidence}% confidence)`);
    const head = parts.length ? parts.join(' ') + ' — ' : '';
    el.textContent = head + (a.summary || '');
  }
}

async function refresh() {
  try {
    const price = await api.getPrice();
    renderPrice(price);

    const news = await api.getNews();
    if (!news.pending && window.renderNews) window.renderNews(mapNews(news));

    const tweets = await api.getTweets();
    // setTweets sets ALL_TWEETS (so filter buttons work) + renders + updates stats.
    if (!tweets.pending) {
      if (typeof window.setTweets === 'function') window.setTweets(mapTweets(tweets));
      else if (window.renderTweets) window.renderTweets(mapTweets(tweets));
    }

    // computeSignal reads DOM (sentiment/twitter/news/fib) and takes optional { change }.
    if (window.computeSignal) {
      const change = price && !price.pending ? price.octChange24h : null;
      window.computeSignal(change != null ? { change } : undefined);
    }

    const analysis = await api.analyze({ force: false }); // force:false → cheap, TTL-cached
    if (!analysis.pending) renderAnalysis(analysis);
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

(async function init() {
  if (!auth.isConfigured) { showLogin('Supabase not configured — see frontend/README.md'); return; }
  const token = await auth.getToken();
  if (token) { hideLogin(); await refresh(); } else { showLogin(); }
})();
