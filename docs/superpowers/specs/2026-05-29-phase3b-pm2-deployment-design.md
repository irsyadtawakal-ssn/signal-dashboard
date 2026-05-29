# Phase 3b — pm2 Deployment Design

**Date:** 2026-05-29
**Status:** Approved
**Scope:** VPS deployment config for 24/7 operation of the Signal Dashboard backend

---

## Goal

Make the backend run automatically 24/7 on a Linux VPS: start on boot, auto-restart on crash, logs persisted to disk.

## Approach

pm2 (process manager) handles Node.js restarts and log rotation. pm2 is itself registered as a systemd service via `pm2 startup`, so it survives VPS reboots without any manual intervention.

This is the standard production pm2 pattern — no extra dependencies, no custom scripts.

---

## Deliverables

### 1. `backend/pm2.config.js`

pm2 ecosystem file. Key settings:

| Field | Value | Reason |
|---|---|---|
| `name` | `signal-dashboard` | identifier for `pm2 status` / `pm2 logs` |
| `script` | `src/server.js` | entrypoint |
| `cwd` | `./` | relative to backend/ when started from there |
| `instances` | `1` | single process, sufficient for ≤5 users |
| `autorestart` | `true` | auto-restart on crash |
| `max_restarts` | `10` | circuit breaker — stops looping if config is broken |
| `restart_delay` | `5000` | 5 s back-off between restarts |
| `env_file` | `.env` | loads backend/.env automatically |
| `out_file` | `logs/app.log` | stdout log |
| `error_file` | `logs/error.log` | stderr log |
| `log_date_format` | `YYYY-MM-DD HH:mm:ss` | human-readable timestamps |
| `merge_logs` | `true` | single log per app (not per instance) |

### 2. `backend/README.md` — new Deploy section

Added after the existing **Endpoints** section. Covers:

1. `npm ci --omit=dev` — production install (no devDeps)
2. `pm2 start pm2.config.js` — start the process
3. `pm2 startup` → copy-paste the generated systemd command — register pm2 on boot
4. `pm2 save` — persist current process list so it survives reboot
5. Quick ops reference: `pm2 status`, `pm2 logs signal-dashboard`, `pm2 restart signal-dashboard`

---

## Out of Scope

- Nginx reverse proxy / HTTPS (user's VPS may already have a setup; instructions would vary)
- Log rotation config (pm2's built-in `--merge-logs` + OS logrotate covers basic needs)
- Multi-instance / cluster mode (overkill for ≤5 users)
- Automated deploy script (`git pull` + `pm2 reload`) — can be added in a later ops iteration

---

## Done Criteria

- [ ] `pm2 start backend/pm2.config.js` launches the backend with correct env
- [ ] `pm2 startup` + `pm2 save` survives a simulated reboot (`pm2 kill` → `pm2 resurrect`)
- [ ] Logs appear in `backend/logs/app.log` and `backend/logs/error.log`
- [ ] README Deploy section documents the full setup sequence
