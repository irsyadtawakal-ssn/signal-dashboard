# OCT Signal Dashboard — Laporan Update untuk Boss

**Tanggal:** 3 Juni 2026  
**Status:** ✅ Live & Operational  
**URL:** https://signal-dashboard.web.id

---

## 📌 Ringkasan Singkat

Dashboard sinyal trading OCT sudah diperbarui dengan **engine analisis teknikal berbasis matematika murni** yang menggantikan sistem AI (Claude Opus) sebelumnya.

**Hasil utama:**
- Biaya API turun dari **$5 per 2 hari → $0 per hari**
- Signal tetap berjalan otomatis setiap 10 menit
- Notifikasi Telegram aktif saat signal berubah

---

## 💰 Masalah Sebelumnya vs Solusi

| | Sebelumnya | Sekarang |
|---|---|---|
| Engine | Claude Opus AI | Pure Math (MA + RSI + Volume + Macro) |
| Biaya | ~$75/bulan | **$0/bulan** |
| Twitter API | Aktif (biaya token) | **Dinonaktifkan** |
| Update signal | Per request | **Otomatis setiap 10 menit** |
| Notifikasi | Setiap run | **Hanya saat signal berubah** |

---

## 📐 Cara Kerja Technical Analysis Engine

Engine menghitung 4 indikator secara bersamaan, lalu menggabungkannya menjadi satu sinyal:

### 1. Moving Average (MA Trend)
- **MA50** = rata-rata harga 50 hari terakhir
- **MA200** = rata-rata harga 200 hari terakhir
- Logika: Kalau harga > MA50 > MA200 → **tren naik** (+1 poin)
- Logika: Kalau harga < MA50 < MA200 → **tren turun** (-1 poin)

### 2. RSI — Relative Strength Index (14 periode)
- Mengukur apakah OCT sudah terlalu mahal atau terlalu murah
- **RSI < 30** → Oversold / terlalu murah → potensi naik (+0.5 poin)
- **RSI > 70** → Overbought / terlalu mahal → potensi turun (-0.5 poin)
- **RSI 30-70** → Neutral (0 poin)

### 3. Volume Analysis
- Membandingkan volume trading hari ini vs rata-rata 30 hari terakhir
- **Volume > 1.5x** rata-rata → aktivitas tinggi, konfirmasi tren (+0.5 poin)
- **Volume < 0.5x** rata-rata → sepi, sinyal lemah (-0.5 poin)

### 4. Macro Trend (BTC & ETH)
- Memantau kondisi pasar kripto secara keseluruhan
- **BTC+ETH naik > 2%** → pasar bullish, menguntungkan OCT (+0.5 poin)
- **BTC+ETH turun > 2%** → pasar bearish, tekanan jual (-0.5 poin)

### Sistem Skor

```
Total skor = MA + RSI + Volume + Macro
Range: -3 (sangat bearish) sampai +3 (sangat bullish)

Skor ≥ +2  →  🟢 BUY  (confidence 65-95%)
Skor ≤ -2  →  🔴 SELL (confidence 65-95%)
Skor -1~+1 →  🟡 HOLD (confidence 50-65%)
```

---

## 🔔 Kapan Notifikasi Telegram Dikirim?

Notifikasi **HANYA dikirim saat signal berubah** (anti-spam):

| Perubahan Signal | Notifikasi |
|---|---|
| HOLD → BUY | ✅ Dikirim |
| HOLD → SELL | ✅ Dikirim |
| BUY → SELL | ✅ Dikirim |
| SELL → BUY | ✅ Dikirim |
| BUY → HOLD | ✅ Dikirim |
| SELL → SELL (sama) | ❌ Tidak dikirim |
| BUY → BUY (sama) | ❌ Tidak dikirim |

### Contoh isi notifikasi Telegram:

```
🔴 TECHNICAL SIGNAL: SELL
Confidence: 70%

Indicators:
• MA50:  $0.1197
• MA200: $0.1270
• RSI:   53.1
• Vol:   2.61x rata-rata

Analysis:
✗ Harga di bawah MA50 & MA200 (Downtrend)
⊙ RSI neutral (30-70)
HIGH_VOLUME (ratio: 2.61x)
STRONG_BEAR (BTC: -4.14%, ETH: -5.31%)
```

---

## ⏱️ Apakah Realtime?

**Tidak realtime — update setiap 10 menit.**

Ini disengaja karena:

1. **MA50/MA200 berbasis data harian** — tidak berubah signifikan dalam detik
2. **RSI 14-periode** — dirancang untuk swing trading, bukan scalping
3. **Mencegah false signal** — spike harga 2 menit bisa langsung balik

**Jeda maksimal:** 10 menit dari perubahan harga ke update signal.

| Cocok untuk | Tidak cocok untuk |
|---|---|
| ✅ Swing trading (hold beberapa hari) | ❌ Scalping (beli-jual menit-an) |
| ✅ Pantau tren harian | ❌ High-frequency trading |
| ✅ Entry/exit berdasarkan tren besar | ❌ Reaksi instan saat pump/dump |
| ✅ Deteksi momentum awal bull/bear | |

> **Interval bisa diubah** di konfigurasi server (min. 1 menit), tapi makin cepat = makin banyak false signal. Rekomendasi: tetap 10 menit.

---

## 🖥️ Status Deployment

```
Server  : VPS (signal-dashboard.web.id)
Process : PM2 (fork mode, auto-restart)
Startup : systemd (survive VPS reboot)
Database: SQLite (lokal, tidak ada biaya cloud)
```

### API Endpoints (Public, tanpa login):

| Endpoint | Fungsi |
|---|---|
| `GET /api/signals/current` | Signal terkini |
| `GET /api/signals/daily` | Histori signal harian (30 hari) |
| `GET /api/signals/10min` | Histori signal 10 menit (30 hari) |

---

## 📊 Periode Validasi

| | |
|---|---|
| **Mulai** | 3 Juni 2026 |
| **Selesai** | 17 Juni 2026 |
| **Tujuan** | Monitor akurasi signal vs pergerakan harga aktual |
| **Keputusan** | Kalau akurasi bagus → lanjutkan. Kalau kurang → evaluasi ulang |

---

## 🚀 Cara Setup Notifikasi Telegram

1. Buka dashboard → klik tombol **TELEGRAM**
2. Chat [@userinfobot](https://t.me/userinfobot) di Telegram → dapat Chat ID
3. Paste Chat ID di form → klik **SAVE**
4. Notifikasi otomatis aktif saat signal berubah

---

## 📝 Catatan Teknis

- **Data historis:** 201 hari harga OCT sudah di-backfill untuk akurasi MA50/MA200
- **Fallback:** Jika API harga gagal, engine menggunakan data cache terakhir
- **Twitter:** Sepenuhnya dinonaktifkan (`DISABLE_TWITTER=true`)
- **Anthropic API:** Tidak digunakan sama sekali di engine baru ini

---

*Laporan dibuat: 3 Juni 2026 | Engine: Technical Analysis v1.0*
