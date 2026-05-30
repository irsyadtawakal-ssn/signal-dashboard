# VPS Deployment Guide — Signal Dashboard Backend

Complete step-by-step deployment to Linux VPS (Biznet Gio, Hetzner, DigitalOcean, etc.) with explanations and troubleshooting.

## Prerequisites

- VPS with **Ubuntu 22.04 LTS or later**
- SSH access as **root** (or user with sudo)
- **2 GB RAM minimum** (1 GB + 2 GB swap if memory-constrained)
- **Node.js 20+** (we'll install)
- **Supabase project created** with JWT secret
- **Backend code cloned** to `/root/signal-dashboard` (or your home dir)

---

## Phase 1: System Preparation & Dependencies

### 1.1 Update System Packages

**What it does:** Fetches latest security patches and package lists from Ubuntu repos.

```bash
apt update && apt upgrade -y
```

**Why:** VPS images are often outdated. Security patches are critical before exposing to the internet.

**Expected output:**
```
Reading package lists... Done
Setting up ubuntu-standard (5.4.0.42.46) ...
```

---

### 1.2 Install Build Essentials

**What it does:** Installs C/C++ compiler, Python, and other tools needed to compile native Node modules.

```bash
apt install -y curl wget git build-essential python3 htop
```

**Components:**
- `curl` / `wget` — download files from internet
- `git` — clone/pull code
- `build-essential` — GCC compiler (required for `better-sqlite3` native binding)
- `python3` — some npm packages need Python during build
- `htop` — system resource monitor (optional but useful)

**Why:** `better-sqlite3` is a C++ extension that compiles during `npm install`. Without build tools, installation will fail.

**Expected output:**
```
Reading state information... Done
Setting up build-essential (12.9ubuntu3.1) ...
```

---

### 1.3 Install Node.js 20 LTS

**What it does:** Installs Node.js runtime from NodeSource repository (more recent than Ubuntu's default).

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && apt install -y nodejs
```

**Why:** Ubuntu default Node is often outdated (v12-v16). We need v20+ for modern JS features.

**Expected output:**
```
node -v
v20.11.0

npm -v
10.2.4
```

---

### 1.4 Install PM2 Globally

**What it does:** Installs pm2 package manager for Node processes system-wide.

```bash
npm install -g pm2
```

**Why:** PM2 manages process lifecycle — restarts on crash, survives reboots, centralized logs.

**Expected output:**
```
added 46 packages in 2s
npm notice
npm notice New minor version of npm available: 10.2.4 → 10.8.2
```

---

## Phase 2: Backend Setup

### 2.1 Create Application Directory

**What it does:** Creates a clean directory to hold the backend code.

```bash
mkdir -p /opt/signal-dashboard
cd /opt/signal-dashboard
```

**Why:** `/opt` is standard for third-party applications. Separates app from OS files.

---

### 2.2 Clone Backend Repository

**What it does:** Downloads your Signal Dashboard backend code from GitHub.

```bash
git clone https://github.com/irsyadtawakal-ssn/signal-dashboard.git .
```

(Note the `.` at the end — clones into current directory, not a subdirectory.)

**Expected output:**
```
Cloning into '.'...
remote: Enumerating objects: 156, done.
remote: Counting objects: 100% (156/156), done.
...
Unpacking objects: 100% (156/156), done.
```

---

### 2.3 Navigate to Backend Directory

```bash
cd /opt/signal-dashboard/backend
```

**Why:** All Node commands must run from `backend/` (where `package.json` lives).

---

### 2.4 Install Production Dependencies

**What it does:** Installs Node packages listed in `package.json`, skipping dev tools (`vitest`, `supertest`).

```bash
npm ci --omit=dev
```

**Why `npm ci` instead of `npm install`?**
- `npm ci` uses `package-lock.json` (exact versions, no surprises in production)
- `npm install` is for development (more flexible, updates versions)

**Expected output (5-10 minutes, depends on internet):**
```
added 47 packages in 5.2s
audit report: found 0 vulnerabilities
```

**If it hangs on `better-sqlite3`:** Compiling native module takes time. Be patient (2-3 min).

**If it fails with "gyp error":** Missing build tools. Go back to 1.2 and retry.

---

### 2.5 Create .env File

**What it does:** Creates a configuration file with API secrets and settings.

Copy the example:
```bash
cp .env.example .env
```

Open and edit:
```bash
nano .env
```

**Minimum required:**
```env
SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>
NODE_ENV=production
PORT=3000
```

**Optional (if you have API keys):**
```env
OPENROUTER_API_KEY=<your-openrouter-key>
ANTHROPIC_API_KEY=<your-anthropic-key>
CRYPTOPANIC_TOKEN=<your-cryptopanic-token>
TWITTER_SCRAPER_TOKEN=<your-twitter-token>
CORS_ORIGIN=https://yourdomain.com
```

**Save:** Press `Ctrl+X`, then `Y`, then `Enter`.

**Why separate file?**
- Keeps secrets out of git
- Different per environment (dev ≠ production)
- Easy to rotate without code changes

---

## Phase 3: PM2 Process Manager Setup

### 3.1 Start Backend via PM2

**What it does:** Launches the Node app under PM2 management.

```bash
pm2 start pm2.config.js
```

**Expected output:**
```
[PM2] Spawning PM2 daemon with pm2_home=/root/.pm2
[PM2] PM2 daemon has been started
[PM2] App started

┌─────┬───────────────────┬─────────┬──────┬─────────┐
│ id  │ name              │ version │ pid  │ status  │
├─────┼───────────────────┼─────────┼──────┼─────────┤
│ 0   │ signal-dashboard  │ 0.1.0   │ 1234 │ online  │
└─────┴───────────────────┴─────────┴──────┴─────────┘
```

**Check logs:**
```bash
pm2 logs signal-dashboard --lines 50
```

**Expected:** You should see "Server running on port 3000" or similar.

---

### 3.2 Enable PM2 Startup on Reboot

**What it does:** Registers PM2 with systemd so the backend restarts automatically after VPS reboot.

```bash
pm2 startup
```

**This will print a long command.** Copy and paste the ENTIRE output:

```bash
# Example (yours will be different, copy the full output):
sudo env PATH=$PATH:/usr/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
```

**Why:** Without this, if the VPS reboots, PM2 won't start and your backend stays down.

---

### 3.3 Save PM2 Process List

**What it does:** Saves current PM2 process state so it can restore on reboot.

```bash
pm2 save
```

**Expected output:**
```
[PM2] Saving current process list...
[PM2] Successfully saved in ~/.pm2/dump.pm2
```

---

## Phase 4: Test Backend Connectivity

### 4.1 Health Check (No Auth)

**What it does:** Tests if the backend is responding.

```bash
curl http://localhost:3000/api/health
```

**Expected output:**
```json
{"status":"ok"}
```

**If it fails:** Check logs with `pm2 logs signal-dashboard`.

---

### 4.2 Verify Auth is Enforced

**What it does:** Confirms protected endpoints reject requests without valid JWT.

```bash
curl http://localhost:3000/api/price
```

**Expected output:**
```json
{"error":"Unauthorized"}
```

(The 401 is expected — we don't have a valid JWT token yet.)

---

## Phase 5: Firewall & Network Security

### 5.1 Enable UFW (Uncomplicated Firewall)

**What it does:** Blocks all incoming traffic except SSH and HTTP/HTTPS.

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS (for later, Nginx + HTTPS)
ufw enable
```

**Answer `y` when asked to proceed.**

**Check status:**
```bash
ufw status
```

**Expected output:**
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
```

---

## Phase 6: Memory Swap (Extra Safety)

**What it does:** Creates a swap file so the system doesn't run out of memory during `npm install` or traffic spikes.

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

**Make permanent (survives reboot):**
```bash
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**Verify:**
```bash
free -h
```

**Expected output:**
```
              total        used        free
Mem:          1.9Gi       120Mi       1.7Gi
Swap:         2.0Gi          0B       2.0Gi
```

---

## Phase 7: Frontend Setup (Static HTML via Nginx)

### 7.1 Install Nginx

**What it does:** Installs reverse proxy / web server.

```bash
apt install -y nginx
```

---

### 7.2 Create Nginx Config

**What it does:** Routes requests to the backend API and serves static frontend files.

```bash
cat > /etc/nginx/sites-available/signal-dashboard <<'EOF'
server {
    listen 80 default_server;
    server_name _;

    # Serve frontend static files
    root /opt/signal-dashboard/frontend;
    index index.html;

    # API proxy to backend (port 3000)
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Fallback to index.html for SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
```

---

### 7.3 Enable Nginx Config

```bash
ln -sf /etc/nginx/sites-available/signal-dashboard /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
```

---

### 7.4 Test & Restart Nginx

```bash
nginx -t
systemctl restart nginx
```

**Expected output:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

---

## Phase 8: Test Full Stack

### 8.1 Check Backend Status

```bash
pm2 status
```

**Expected:**
```
┌─────┬───────────────────┬─────────┬──────┬─────────┐
│ id  │ name              │ version │ pid  │ status  │
├─────┼───────────────────┼─────────┼──────┼─────────┤
│ 0   │ signal-dashboard  │ 0.1.0   │ 1234 │ online  │
└─────┴───────────────────┴─────────┴──────┴─────────┘
```

---

### 8.2 Test via VPS IP

From **your local machine** (not VPS):

```powershell
# Replace with your actual VPS IP
curl http://103.87.66.132/api/health
```

**Expected:**
```json
{"status":"ok"}
```

If it works, **backend is reachable from the internet!**

---

## Phase 9: Backup Strategy

### 9.1 Create Backup Script

**What it does:** Backs up the SQLite database regularly.

```bash
cat > /opt/signal-dashboard/backup.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/opt/signal-dashboard/backups"
mkdir -p $BACKUP_DIR
DB_FILE="/opt/signal-dashboard/backend/cache.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp $DB_FILE $BACKUP_DIR/cache.db.backup.$TIMESTAMP
# Keep only last 30 backups
ls -1t $BACKUP_DIR/cache.db.backup.* | tail -n +31 | xargs -r rm
EOF

chmod +x /opt/signal-dashboard/backup.sh
```

---

### 9.2 Schedule Daily Backup via Cron

```bash
crontab -e
```

Add this line at the end:
```
0 2 * * * /opt/signal-dashboard/backup.sh
```

(Runs every day at 2 AM.)

---

## Day-to-Day Operations

### Check Status

```bash
pm2 status
pm2 logs signal-dashboard --lines 50
```

### Restart After Code Update

```bash
cd /opt/signal-dashboard
git pull
cd backend
npm ci --omit=dev
pm2 restart signal-dashboard
```

### Check Memory Usage

```bash
htop
# or
free -h
```

### Check Disk Usage

```bash
df -h
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `npm install` fails with "gyp error" | Missing build-essential. Run step 1.2 again. |
| Port 3000 in use | Another process running. Check `sudo lsof -i :3000`. |
| PM2 not starting on reboot | Did you run both `pm2 startup` AND `pm2 save`? Both required. |
| Nginx shows 502 Bad Gateway | Backend crashed. Check `pm2 logs signal-dashboard`. |
| Frontend won't load | Check Nginx config syntax with `nginx -t`. Verify `frontend/` path exists. |
| Out of memory crashes | Check if swap is active (`free -h`). May need larger VPS. |

---

## Security Checklist

- [ ] SSH key-based auth enabled (password disabled) — handled by VPS provider
- [ ] UFW firewall enabled and rules checked
- [ ] `.env` file has correct permissions (`chmod 600 /opt/signal-dashboard/backend/.env`)
- [ ] `CORS_ORIGIN` in `.env` matches your frontend domain
- [ ] No hardcoded secrets in code or git history
- [ ] HTTPS setup (next phase, using Let's Encrypt)

---

## Next: HTTPS Setup (Phase 4)

Once this is stable, add SSL/TLS:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com
```

Will auto-renew via cron. Configure Nginx to redirect HTTP → HTTPS.

---

## Questions?

Check logs: `pm2 logs signal-dashboard`
Check config: `cat /opt/signal-dashboard/backend/.env`
Check Nginx: `nginx -T`
