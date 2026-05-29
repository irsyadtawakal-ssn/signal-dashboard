# PRD — OCT Signal Intelligence Trading Dashboard

**Versi Dokumen:** 2.0 (final, keputusan teknis terkunci)
**Tanggal:** 29 Mei 2026
**Status:** Disetujui untuk masuk tahap perencanaan implementasi
**Audiens:** Internal tim dev / agensi (spec teknis)
**Pemilik Produk:** Tim Agensi (PIC Pengembangan)
**Stakeholder:** Pak Akbar (Klien), Trader Internal (≤5 user)
**Repo:** https://github.com/irsyadtawakal-ssn/signal-dashboard

---

## 1. Ringkasan Eksekutif

OCT Signal Intelligence adalah dashboard trading internal yang memusatkan seluruh data pengambilan keputusan untuk token **Octra (OCT)** dalam satu layar: harga live on-chain (DexScreener / Uniswap V4 Ethereum), kalkulator Fibonacci otomatis, feed sentimen Twitter/X yang dikurasi AI (Claude), berita crypto, tracker portfolio + exit plan, dan satu indikator rekomendasi gabungan (**BUY / HOLD / SELL**).

Sudah ada prototype HTML client-side (`octra-dashboard-v3 (3).html`, v3.1) sebagai bukti konsep. Prototype ini punya **celah keamanan kritikal** (API Key Claude ditembak langsung dari browser) dan **tanpa caching**, jadi belum layak operasional 24/7. PRD ini mendefinisikan pembangunan **backend Node.js yang aman + caching SQLite** dan finalisasi dashboard agar siap produksi untuk maksimal 5 user internal.

---

## 2. Latar Belakang & Masalah

Trader internal kini harus membuka banyak tab (DexScreener, Twitter, kalkulator Fibonacci manual, spreadsheet portfolio) untuk satu keputusan trading — lambat dan rawan kehilangan momentum *breakout*.

Masalah konkret kondisi saat ini:

1. **Keamanan (Urgent):** Request AI Claude ditembak langsung dari browser. API Key bisa diintip via *Inspect Element* → risiko penyalahgunaan & tagihan membengkak.
2. **Biaya tidak terkontrol:** Tanpa caching, setiap refresh memanggil API X/Twitter dan Claude penuh.
3. **Stabilitas data:** Free tier (mis. CoinGecko) sering kena Error 429 & delay — bahaya untuk *fast-trade*.
4. **Fragmentasi:** Belum ada satu sumber kebenaran untuk sinyal BUY/HOLD/SELL.

---

## 3. Tujuan & Metrik Sukses

### 3.1 Tujuan Produk
- Menyatukan seluruh sinyal trading OCT dalam satu dashboard andal 24/7.
- Mengamankan 100% kredensial API di sisi server.
- Menekan biaya operasional API ke target **≤ Rp 1.000.000 / bulan**.
- Mempercepat pengambilan keputusan trader (multi-tab → satu layar).

### 3.2 Metrik Sukses (KPI)
| Metrik | Target |
| :--- | :--- |
| API Key terekspos di client-side | 0 (nol) |
| Penghematan biaya input Claude via caching | ≥ 85–90% |
| Uptime dashboard | ≥ 99% (24/7) |
| Error 429 yang terlihat user (data nge-blank) | Mendekati 0 (disajikan dari cache) |
| Total biaya operasional bulanan | ≤ Rp 1.000.000 |
| Latensi muat data dashboard (dari cache) | < 2 detik |

---

## 4. Pengguna & Persona

- **Bos / Decision Maker (Pak Akbar):** lihat sinyal BUY/HOLD/SELL & estimasi profit portfolio cepat, tanpa detail teknis.
- **Trader Internal (≤5 user):** butuh chart live, level Fibonacci, sentimen Twitter, exit plan untuk eksekusi.
- **Admin / Agensi (PIC):** memelihara backend, atur cron job, pantau biaya & kuota API.

Skala: **maksimal 5 user internal**, bukan aplikasi publik.

---

## 5. Lingkup Fitur

### 5.1 Fitur Utama (Functional Requirements)

#### F1 — Live Chart Terintegrasi
- Menampilkan chart **OCT/ETH** & **OCT/USD** dari DexScreener (Uniswap V4 Ethereum) via embed.
- Pilihan interval timeframe.
- **Acceptance:** Chart termuat di dashboard tanpa buka web eksternal; pair OCT benar.

#### F2 — Fibonacci Calculator Otomatis
- Input manual *Swing High* & *Swing Low* (USD).
- Output otomatis level retracement & extension (0.236, 0.382, **0.618 golden ratio**, 0.786, 1.0, 1.618, dst) sebagai Support & Resistance.
- Menampilkan harga OCT saat ini sebagai referensi.
- **Acceptance:** Saat Swing diisi, semua level dihitung otomatis & ditandai Support/Resistance relatif harga sekarang.

#### F3 — Twitter Live Feed (Sentiment AI)
- Backend menarik tweet via **scraper pihak ketiga** (Apify/Xpoz) untuk keyword: `"Octra"`, `"$OCT"`, `"FHE layer1"`, `"OCT listing"`.
- **Claude Sonnet** mengklasifikasikan tweet → **Bullish / Bearish / Whale**.
- Dashboard auto-refresh tiap 3–5 menit **dari cache SQLite** (bukan call live per user).
- **Acceptance:** Feed menampilkan tweet terkurasi + label sentimen; refresh tidak memicu call API baru selama cache valid.

#### F4 — Portfolio & Exit Plan Tracker
- Input manual: **jumlah OCT** & **harga beli rata-rata (Avg Buy)**.
- Output: nilai portfolio, profit/loss, target berikutnya.
- **Exit Strategy Plan T1–T7** rentang **$0.25 → $3.00** dengan persen jual per level (mis. T2 $0.40 = capital recovery).
- **Acceptance:** Profit terhitung otomatis dari harga live; level exit menandai status (current/done) sesuai harga sekarang.

#### F5 — Signal Scores Indicator
- Rekomendasi otomatis: **BUY / HOLD / SELL**.
- Gabungan: *Price Action*, *Sentiment*, *Twitter Buzz*, *Moving Average (MA)*, *Fibonacci*.
- **Acceptance:** Skor per komponen ditampilkan & menghasilkan satu rekomendasi gabungan yang konsisten dengan data.

#### F6 — News Feed (CryptoPanic)
- Headline + link artikel (Free Tier), di-cron 1 jam sekali.
- **Acceptance:** Headline terbaru tampil; klik membuka artikel sumber.

### 5.2 Di Luar Lingkup (Fase Ini)
- Eksekusi order / trading bot otomatis.
- Multi-tenant / akses publik skala besar.
- Aplikasi mobile native.
- Integrasi exchange CEX langsung.
- Data real-time sub-detik (WebSocket) — kecuali upgrade CoinGecko Analyst di kemudian hari.

---

## 6. Persyaratan Non-Fungsional

| Kategori | Persyaratan |
| :--- | :--- |
| **Keamanan** | Semua API Key di server backend (env vars). Tidak ada key di client. HTTPS wajib. |
| **Performa** | Data disajikan dari cache SQLite; muat awal < 2 detik. |
| **Ketersediaan** | 24/7, uptime ≥ 99%. |
| **Biaya** | ≤ Rp 1.000.000/bulan via caching & free tier yang aman. |
| **Skalabilitas** | Cukup untuk ≤5 user; arsitektur tetap memungkinkan upgrade tier API. |
| **Maintainability** | Cron & konfigurasi terdokumentasi; logging untuk pantau kuota. |

---

## 7. Arsitektur Teknis

### 7.1 Keputusan Stack (terkunci)
- **Backend:** **Node.js custom** (Express/Fastify). Server API sendiri yang memegang semua kredensial; dashboard hanya bicara ke endpoint internal ini.
- **Database / Cache:** **SQLite** (file-based). Cron menulis hasil API ke tabel cache; endpoint membaca dari cache. Nol biaya, cukup untuk 5 user, ringan di VPS basic.
- **AI:** **Claude Sonnet (default)** untuk scan & klasifikasi sentimen rutin (volume tinggi, murah) + **Claude Opus on-demand** hanya saat user minta ringkasan analisa mendalam. **Prompt Caching aktif** di kedua jalur (diskon input ~90%).
- **Frontend:** Lanjutkan prototype **v3.1 yang dirapikan** — hapus semua call API langsung dari browser, sambungkan ke endpoint backend, lalu polish UI. Bukan rebuild framework.

### 7.2 Diagram
```
[Browser (≤5 user)]  ──HTTPS──►  [Backend Node.js (Express/Fastify) @ VPS]
                                       │
                                       ├─► SQLite (tabel cache: price, tweets, sentiment, news)
                                       │
                  ┌────────────────────┼─────────────────────────────────┐
                  ▼                     ▼                ▼                 ▼
            DexScreener API       CoinGecko API    Twitter Scraper    Claude API
            (gratis, public)      (harga makro)    (Apify/Xpoz)       (Sonnet default,
                                                                       Opus on-demand)
                                                          + Prompt Caching
                                                   CryptoPanic API (berita)
```

### 7.3 Pola Endpoint (indikatif)
- `GET /api/price` — harga OCT + makro (BTC/ETH) dari cache.
- `GET /api/tweets` — tweet terkurasi + label sentimen dari cache.
- `GET /api/news` — headline CryptoPanic dari cache.
- `POST /api/analyze` — trigger analisa mendalam (Opus on-demand).
- Semua endpoint membaca SQLite; tidak ada kredensial yang bocor ke client.

### 7.4 Cron / Scheduler (backend)
- Harga (DexScreener + CoinGecko) & Twitter+Sentiment AI: **tiap 3–5 menit**.
- Berita CryptoPanic: **tiap 1 jam** (24×/hari, aman di free tier 100 req/hari).
- Hasil ditulis ke SQLite; jika sumber error, dashboard tetap menyajikan data cache terakhir (no nge-blank).

### 7.5 Sumber Data / Integrasi API
| API | Fungsi | Paket |
| :--- | :--- | :--- |
| **DexScreener** | Harga live DEX (OCT/ETH, OCT/USD) | Gratis (public REST, tanpa key) |
| **CoinGecko** | Harga makro (BTC, ETH) | Free; upgrade Basic ($35/bln) jika stabilitas perlu |
| **X/Twitter Scraper** | Tweet per keyword | Apify/Xpoz (~$10–20/bln) |
| **Anthropic Claude** | Klasifikasi & analisa sentimen | Pay-per-use + Prompt Caching (Sonnet default, Opus on-demand) |
| **CryptoPanic** | Berita crypto | Free Tier ($0) |

---

## 8. Estimasi Biaya Operasional

Asumsi trafik: **6×/jam × 24 × 30 = 4.320 request/bulan**. Kurs Rp 17.877.

| Komponen | Hitungan | Biaya / bulan |
| :--- | :--- | :--- |
| Mini VPS (Node.js backend) | $5.00 × Rp 17.877 | **Rp 89.385** |
| CoinGecko API | 4.320 req < free tier 10k | **Rp 0** |
| DexScreener API | Public REST gratis | **Rp 0** |
| Twitter Scraper | ~$10 × Rp 17.877 | **Rp 178.770** |
| Claude API | Estimasi konservatif basis Opus (~$24.64) → **lebih rendah karena default Sonnet** | **≤ Rp 440.489** |
| CryptoPanic API | Free tier | **Rp 0** |
| **TOTAL ALL-IN** | | **~Rp 700.000 – Rp 1.000.000** |

> **Catatan biaya AI:** Simulasi Rp440k di brief berbasis Opus penuh. Karena scan rutin kini default ke **Sonnet** (jauh lebih murah) dan Opus hanya on-demand, biaya aktual Claude diperkirakan **di bawah angka tersebut**. Total all-in tetap dipatok konservatif ≤ Rp 1jt.

---

## 9. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
| :--- | :--- | :--- |
| API Key bocor dari client | Tagihan membengkak | Semua auth di backend Node.js (Tahap 1, urgent) |
| Free tier kena 429 / delay | Data nge-blank | Sajikan dari SQLite cache; opsi upgrade CoinGecko Basic |
| Biaya Claude/Twitter membengkak | Over budget | Prompt caching + cron 3–5 menit + Sonnet default |
| Scraper Twitter berubah/terblokir | Feed sentimen mati | Abstraksi provider; fallback Apify ↔ Xpoz |
| Data sentimen mentah kurang akurat | Sinyal AI kurang tajam | Prompt engineering Claude untuk normalisasi teks mentah |
| SQLite korup / VPS down | Hilang cache & layanan | Backup file SQLite berkala; restart otomatis (pm2/systemd) |

---

## 10. Tahapan Kerja (Scope of Work / Roadmap)

### Tahap 1 — Setup Backend & Database
- Provisioning Mini VPS, instalasi Node.js + process manager (pm2/systemd).
- Setup SQLite + skema tabel cache.
- **Pindahkan seluruh autentikasi API ke backend** (atasi celah keamanan API Key) — *prioritas urgent*.

**Deliverable:** Backend aman jalan, endpoint internal siap, tidak ada key di client.

### Tahap 2 — Integrasi & Caching API
- Integrasi DexScreener, CoinGecko, Twitter Scraper, CryptoPanic, Claude (Sonnet + Opus on-demand).
- Cron job (3–5 menit harga/AI, 1 jam berita) → tulis ke SQLite.
- Aktivasi **Prompt Caching** Claude.

**Deliverable:** Semua data tersaji stabil dari cache; biaya terkendali; klasifikasi sentimen AI jalan.

### Tahap 3 — Final UI Polish & Deployment
- Rapikan frontend v3.1, sambungkan ke endpoint server (hapus call API client-side).
- Finalisasi Signal Scores gabungan, polish UI.
- Deployment operasional 24/7.

**Deliverable:** Dashboard produksi siap untuk 5 user internal, online 24/7.

---

## 11. Kriteria Penerimaan Akhir (Definition of Done)

- [ ] Tidak ada API Key apa pun terlihat di browser (verifikasi Inspect Element / Network).
- [ ] Semua fitur F1–F6 berfungsi sesuai acceptance criteria.
- [ ] Data disajikan dari SQLite cache; refresh user tidak memicu call API berlebih.
- [ ] Prompt Caching Claude aktif & terbukti hemat biaya input.
- [ ] Sonnet default jalan untuk scan rutin; Opus hanya terpanggil on-demand.
- [ ] Dashboard berjalan 24/7 di VPS dengan uptime terpantau.
- [ ] Total biaya bulanan terkonfirmasi ≤ Rp 1.000.000.
- [ ] Dokumentasi konfigurasi cron, env vars, & API tersedia untuk admin.

---

## 12. Lampiran (Referensi)

- **Sumber brief:** `Dashboard Trading Khusus (Signal Intelligence) .md`
- **Prototype:** `octra-dashboard-v3 (3).html` (v3.1 — client-side, akan di-backend-kan & dirapikan)
- **Token OCT (Uniswap V4 Ethereum):** `0x4647...6E80`
- **Exit Levels:** T1–T7, rentang $0.25 → $3.00
- **Repo:** https://github.com/irsyadtawakal-ssn/signal-dashboard
