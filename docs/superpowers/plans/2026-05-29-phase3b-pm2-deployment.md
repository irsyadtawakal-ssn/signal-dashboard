# Phase 3b — pm2 Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `pm2.config.js` ecosystem file and a Deploy section to the backend README so the backend runs 24/7 on a Linux VPS with auto-restart on crash and auto-start on reboot.

**Architecture:** pm2 manages the Node.js process (crash restarts, log files, env loading). pm2 is itself registered as a systemd service via `pm2 startup` + `pm2 save` so it survives VPS reboots. No new npm dependencies — pm2 is installed globally on the VPS.

**Tech Stack:** pm2 (global, VPS-side), Node.js 20+, existing Express backend.

**Reference spec:** `docs/superpowers/specs/2026-05-29-phase3b-pm2-deployment-design.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/pm2.config.js` | **Create** | pm2 ecosystem config |
| `backend/README.md` | **Modify** | Add Deploy section after Endpoints |

No source files, no tests — this is pure config + docs.

---

## Task 1: pm2 ecosystem file

**Files:**
- Create: `backend/pm2.config.js`

- [ ] **Step 1: Create `backend/pm2.config.js`**

```js
module.exports = {
  apps: [
    {
      name: 'signal-dashboard',
      script: 'src/server.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env_file: '.env',
      out_file: 'logs/app.log',
      error_file: 'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
```

- [ ] **Step 2: Verify the file parses (no typos)**

Run from the project root:
```bash
node -e "const c = require('./backend/pm2.config.js'); console.log(c.apps[0].name)"
```
Expected output: `signal-dashboard`

- [ ] **Step 3: Commit**

```bash
git add backend/pm2.config.js
git commit -m "feat(deploy): add pm2 ecosystem config"
```

---

## Task 2: Deploy section in README

**Files:**
- Modify: `backend/README.md`

Add a new **Deploy to VPS** section immediately after the existing **Auth** section (end of file).

- [ ] **Step 1: Append the Deploy section to `backend/README.md`**

Open `backend/README.md` and add the following after the last line:

````markdown

## Deploy to VPS

The backend is designed to run as a managed pm2 process on a Linux VPS.

### First-time setup

```bash
# 1. Install pm2 globally (once per VPS)
npm install -g pm2

# 2. Production install (skip devDependencies)
cd backend && npm ci --omit=dev

# 3. Copy env and fill required values
cp .env.example .env
# Edit .env — at minimum set SUPABASE_JWT_SECRET
# Optional: OPENROUTER_API_KEY / ANTHROPIC_API_KEY, CRYPTOPANIC_TOKEN, TWITTER_SCRAPER_TOKEN, CORS_ORIGIN

# 4. Start the process
pm2 start pm2.config.js

# 5. Register pm2 with the OS so it survives reboots
pm2 startup
# ↑ This prints a command — copy-paste and run it (requires sudo)

# 6. Save the current process list
pm2 save
```

After step 6, pm2 will restart automatically after any VPS reboot.

### Day-to-day operations

```bash
pm2 status                        # see all running processes + uptime
pm2 logs signal-dashboard         # tail live logs
pm2 logs signal-dashboard --lines 200  # last 200 log lines
pm2 restart signal-dashboard      # restart after config/env change
pm2 stop signal-dashboard         # stop without removing
pm2 delete signal-dashboard       # remove from pm2 process list
```

### Updating the backend

```bash
git pull
cd backend && npm ci --omit=dev
pm2 restart signal-dashboard
```

### Log files

Logs are written to `backend/logs/app.log` (stdout) and `backend/logs/error.log` (stderr).
The `logs/` directory is created automatically by pm2 on first start.
````

- [ ] **Step 2: Verify README renders correctly**

Open `backend/README.md` in a Markdown previewer or run:
```bash
node -e "const fs=require('fs'); const txt=fs.readFileSync('backend/README.md','utf8'); console.log(txt.includes('Deploy to VPS') && txt.includes('pm2 startup') ? 'OK' : 'MISSING SECTION')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/README.md
git commit -m "docs(deploy): add pm2 VPS deployment guide to backend README"
```

---

## Done Criteria

- [ ] `node -e "require('./backend/pm2.config.js')"` exits with no error.
- [ ] `backend/README.md` contains a **Deploy to VPS** section covering `pm2 start`, `pm2 startup`, `pm2 save`, and the ops reference.
- [ ] Both commits on `phase3a-auth` branch, all 99 tests still green.

## Out of Scope

- Nginx / HTTPS config (VPS-specific)
- Log rotation (pm2 built-in + OS logrotate covers basic needs)
- Automated `git pull` deploy hooks
