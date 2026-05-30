# Deploying OCT Signal Dashboard to a VPS

End-to-end guide: backend (pm2) + frontend (static) behind **nginx as a single origin**
(`/` → frontend, `/api/*` → backend on `:3000`). Single origin means **no CORS config needed**.

Assumes a fresh **Ubuntu/Debian** VPS with sudo. Replace `your-domain.com` and paths as needed.

---

## 0. DNS (only if using a domain + HTTPS)
Point an A record for `your-domain.com` → your VPS IP. Skip if accessing by IP for now.

## 1. Install runtime (once per VPS)
```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
sudo npm install -g pm2
node -v && nginx -v && pm2 -v   # sanity check
```

## 2. Get the code
```bash
sudo mkdir -p /var/www && cd /var/www
sudo git clone https://github.com/irsyadtawakal-ssn/signal-dashboard.git
sudo chown -R $USER:$USER /var/www/signal-dashboard
cd /var/www/signal-dashboard
```

## 3. Backend — install, configure, start
```bash
cd /var/www/signal-dashboard/backend
npm ci --omit=dev          # prod deps only (includes better-sqlite3, rss-parser, @anthropic-ai/sdk)

cp .env.example .env
nano .env                  # fill REAL values (this file is gitignored — never commit it)
```
Set in `.env` at minimum:
- `SUPABASE_JWT_SECRET=` — the Supabase project's JWT secret (Settings → API → JWT Secret)
- `ANTHROPIC_API_KEY=` (and `AI_PROVIDER=anthropic`) **or** `OPENROUTER_API_KEY=` — for `/api/tweets` sentiment + `/api/analyze`
- `TWITTER_SCRAPER_TOKEN=` — Apify token, for the live tweets feed
- Leave `CORS_ORIGIN` **unset** (single origin → not needed)
- `PORT=3000` (matches the nginx proxy_pass)

Start under pm2:
```bash
cd /var/www/signal-dashboard/backend
pm2 start pm2.config.js
pm2 startup        # run the sudo command it prints, to survive reboots
pm2 save
pm2 status         # should show "signal-dashboard" online
curl -s localhost:3000/api/health   # → {"status":"ok"}
```

## 4. Frontend — configure
```bash
cd /var/www/signal-dashboard/frontend
cp js/config.example.js js/config.js
nano js/config.js
```
Set (single-origin → `apiBaseUrl` is the empty string so calls go to `/api/*` on the same host):
```js
window.APP_CONFIG = {
  supabaseUrl: 'https://YOUR-REF.supabase.co',
  anonKey: 'YOUR-SUPABASE-ANON-KEY',   // public client key — safe in browser
  apiBaseUrl: '',                       // '' = same origin via nginx proxy
};
```
`config.js` is gitignored; it holds only the public anon key + a relative API base. No secrets.

## 5. nginx — single origin
```bash
sudo cp /var/www/signal-dashboard/deploy/nginx-signal-dashboard.conf \
        /etc/nginx/sites-available/signal-dashboard
sudo nano /etc/nginx/sites-available/signal-dashboard   # set server_name + confirm root path
sudo ln -s /etc/nginx/sites-available/signal-dashboard /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default              # optional: drop the default site
sudo nginx -t && sudo systemctl reload nginx
```
The `root` must point at `/var/www/signal-dashboard/frontend`. nginx needs execute (`x`) on the
path — `/var/www` is world-readable by default; if you cloned under `$HOME`, prefer `/var/www`.

## 6. HTTPS (if you have a domain)
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
# certbot edits the nginx config to add 443 + auto-renews via systemd timer.
```
No domain yet? Skip — the site works over `http://<vps-ip>/`. (Fine for ≤5 internal users; add
HTTPS later — Supabase password login + JWT still function over HTTP.)

## 7. Supabase users (no self-signup)
In the Supabase dashboard → Authentication:
- Create the ≤5 user accounts manually (email + password).
- Disable self-signup (Providers/Settings).
- Confirm the project **JWT secret** equals `SUPABASE_JWT_SECRET` in `backend/.env` (else every
  request 401s).

## 8. Verify (smoke test)
```bash
curl -s http://localhost:3000/api/health           # {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" http://your-domain.com/        # 200 (frontend)
curl -s -o /dev/null -w "%{http_code}\n" http://your-domain.com/api/price   # 401 (auth-gated — correct!)
```
Then in a browser: open the site → login overlay appears → sign in with a Supabase user →
panels populate (price/news/tweets), enter OCT amount+avg buy → F4 portfolio + T1–T7 ladder,
F5 shows a BUY/HOLD/SELL with a score. `503` on a panel just means that cache is still cold
(wait one scheduler cycle: price/tweets ~5 min, news hourly).

## 9. Updating later
```bash
cd /var/www/signal-dashboard && git pull origin main
cd backend && npm ci --omit=dev && pm2 restart signal-dashboard
# frontend is static — git pull is enough; hard-refresh the browser.
```

---

## Quick reference
| Thing | Where |
|-------|-------|
| Backend process | `pm2 status` / `pm2 logs signal-dashboard` |
| Backend env (secrets) | `backend/.env` (gitignored) |
| Frontend config (public) | `frontend/js/config.js` (gitignored) |
| nginx site | `/etc/nginx/sites-available/signal-dashboard` |
| Backend logs | `backend/logs/app.log`, `backend/logs/error.log` |
| SQLite cache | `backend/data/cache.sqlite` |

## Troubleshooting
- **All `/api` calls 401** → `SUPABASE_JWT_SECRET` in `.env` ≠ the Supabase project secret, or no/expired login token.
- **`502 Bad Gateway` from nginx** → backend not running (`pm2 status`) or wrong `proxy_pass` port.
- **Panels stuck "waiting for first data" (503)** → cache cold; check `pm2 logs` for source errors (e.g. missing `TWITTER_SCRAPER_TOKEN` → tweets stay 503; missing AI key → tweets `Unrated`, `/api/analyze` 503).
- **`pm2` not back after reboot** → you skipped `pm2 startup` (run its printed sudo command) or `pm2 save`.
