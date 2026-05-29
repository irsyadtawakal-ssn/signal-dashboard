### **Dashboard Trading Khusus (Signal Intelligence)** 

### **1\. Fitur Utama Dashboard :**

* **Live Chart Terintegrasi:** Halaman ini langsung nampilin chart harga OCT/ETH atau OCT/USD dari DexScreener (Uniswap V4 Ethereum). Jadi dia ga perlu bolak-balik buka web external.  
* **Fibonacci Calculator Otomatis:** Ada panel khusus buat nyari level *Support* & *Resistance*. Tinggal masukin harga tertinggi (*Swing High*) dan terendah (*Swing Low*), kalkulatornya otomatis ngitung level emas (Ratio 0.618, dll).  
* **Twitter Live Feed (Sentiment AI):** Dashboard ini narik data dari Twitter/X pake AI (menggunakan Claude Sonnet) buat nge-scan tweet seputar keyword "Octra", "$OCT", "FHE layer1". AI-nya bakal nge-kelompokkin mana tweet yang *Bullish* (positif), *Bearish* (negatif), atau info dari *Whale* (cukong).  
* **Portfolio & Exit Plan Tracker:** Ada inputan manual buat ngisi *"Berapa jumlah OCT yang dipunya"* dan *"Berapa rata-rata harga belinya (Avg Buy)"*. Di sebelah kanannya langsung muncul estimasi profit, target berikutnya, bahkan ada **Exit Strategy Plan** dari T1 sampai T7 (dari harga $0.25 sampai $3.00).  
* **Signal Scores Indicator:** Ada rangkuman indikator otomatis yang ngasih rekomendasi langsung: **BUY, HOLD, atau SELL** berdasarkan gabungan data *Price Action*, *Sentiment*, *Twitter Buzz*, *Moving Average (MA)*, dan *Fibonacci*.

### **Tabel Rencana & Estimasi Biaya API (Data Terbaru)**

| Nama API | Kategori Data | Pilihan Paket / Harga | Limitasi & Fitur Utama | Rekomendasi untuk Project Ini |
| :---- | :---- | :---- | :---- | :---- |
| **CoinGecko API** | Harga & Market Data Makro (BTC, ETH, dll) | • **Demo:** $0 / bulan • **Basic:** $35 / bulan • **Analyst:** $129 / bulan | • Demo: 10k call/bln, 100 RPM • Basic: 100k call/bln, 300 RPM • Analyst: 500k call/bln, WebSocket & Webhook live | **Paket Basic ($35/bln)** sudah cukup untuk data harga berkala. Kalau mau bikin trading bot otomatis berbasis sub-detik, baru upgrade ke **Analyst**. |
| **DexScreener API** | Live Harga DEX (Pair OCT/ETH & OCT/USD) | • **Official REST API:** $0 (Gratis) | • Gratis & Publik (Tanpa API Key) • Limitasi rate-limit standar browser. | **Paket Gratis Official.** Ga perlu bayar, data pool Uniswap V4 bisa langsung ditarik lewat API publik mereka untuk update harga token *on-chain*. |
| **X (Twitter) API** | Sentimen Media Sosial & Keyword Tracker | •**Pay-per-use:** $0.005 per *post read* • **Basic (Legacy):** $100 \- $200 / bulan • **Scraper Pihak Ketiga:** $20 \- $100 / bulan | • Paket resmi X sangat mahal untuk baca data massal (Pro capai $5.000/bln). • Scraper (Apify/Xpoz): Lebih murah untuk ambil data tweet per keyword. | **Gunakan Scraper Pihak Ketiga (\~$20/bln)** seperti Apify atau Xpoz. Jauh lebih hemat dibanding API Resmi X yang pelit kuota di tier murahnya. |
| **Anthropic Claude API** | Otak AI / Ringkasan Analisis & Cek Sentimen | **Pay-per-use (per 1 Juta Token):** • Input: $3.00 / MTok • Output: $15.00 / MTok • Caching Hit: Diskon 90% ($0.30 / MTok) | • Model **Claude 3.5 Sonnet / 4.6**. • Biaya dihitung murni dari seberapa sering bot meminta AI menganalisis tweet. | **Pay-per-use \+ Aktifkan Prompt Caching.** Dengan sistem *prompt caching*, sistem bisa hemat biaya input hingga 85-90% karena instruksi analisa dasar gak perlu dibayar full terus-menerus. |
| **CryptoPanic API** | Berita Crypto & Voting Sentimen Komunitas | • **Free Tier:** $0 / bulan • **PRO Tier:** $29.99 / bulan | • Free: Akses feed berita dasar (100 req/hari). • PRO: Dapat metadata penuh \+ angka voting sentimen bullish/bearish dari user. | **Free Tier ($0).** Kolom berita di dashboard boss cukup menampilkan headline dan link artikel, jadi versi gratisan sudah sangat aman untuk di-cron 1 jam sekali. |

**SIMULASI PERHITUNGAN**

Semua hitungan di bawah sudah dikonversi menggunakan kurs riil hari ini (**Rp 17.877,-**).

### **1\. Asumsi Trafik & Volume Data (Per Bulan)**

* **Frekuensi Refresh:** 6 kali per jam $\\times$ 24 jam $\\times$ 30 hari \= **4.320 total request/bulan**.  
* **Model AI Terpilih:** **Claude Opus (Terbaru)** dengan optimasi *Prompt Caching* (diskon kuota input 90%).

### **2\. Simulasi Hitungan Per Masing-Masing API**

#### **A. Mini VPS Server (Backend Layer)**

* **Hitungan:** Biaya sewa server bulanan paling *basic* (bisa pakai DigitalOcean, AWS LightSail, atau Biznet Gio) untuk menjalankan n8n/Node.js.  
* **Biaya:** $5.00 USD $\\times$ Rp 17.877 \= **Rp 89.385,- / bulan**

#### **B. CoinGecko API (Data Harga Makro)**

* **Hitungan:** 4.320 request/bulan masih jauh di bawah jatah paket *Free Tier* resmi CoinGecko (10.000 request/bulan).  
* **Biaya:** **Rp 0,- (Gratis)**

#### **C. DexScreener API (Harga Live OCT)**

* **Hitungan:** Memanfaatkan jalur *public REST API* resmi dari DexScreener tanpa batasan biaya kuota token.  
* **Biaya:** **Rp 0,- (Gratis)**

#### **D. X / Twitter Scraper (Pihak Ketiga)**

* **Hitungan:** Menggunakan platform scraper (seperti Apify) dengan biaya rata-rata $0.001 hingga $0.002 per data tweet yang ditarik. Untuk 4.320 kali tarikan sebulan dengan volume hemat, estimasi habis sekitar $10.00 USD.  
* **Biaya:** $10.00 USD $\\times$ Rp 17.877 \= **Rp 178.770,- / bulan**

#### **E. Anthropic Claude API (Claude Opus \+ Caching)**

* **Hitungan Token:** 17,28 Juta Token Input (90% masuk diskon *caching*) \+ 0,64 Juta Token Output.  
  * Biaya Input Berdiskon: $17,28 \\times \\$0.50 \= \\$8.64$  
  * Biaya Output Standar: $0,64 \\times \\$25.00 \= \\$16.00$  
  * Total USD: $24.64 USD  
* **Biaya:** $24.64 USD $\\times$ Rp 17.877 \= **Rp 440.489,- / bulan**

#### **F. CryptoPanic API (News Feed)**

* **Hitungan:** Setup *cron job* backend cukup menarik data berita 1 jam sekali (24 kali sehari). Jatah *Free Tier* mereka ngasih sampai 100 request per hari.  
* **Biaya:** **Rp 0,- (Gratis)**

### **TOTAL ESTIMASI BIAYA BULANAN (ALL-IN):**

**\~700.000-1.000.000 / PERBULAN**

**PRO DAN CONS PENGGUNAAN API GRATISAN**

Ini perbandingan **Pro & Cons (Keuntungan & Kerugian)** kalau lo maksain pakai *Free Tier* untuk project dashboard internal ini, pake contoh kasus **CoinGecko API** yang paling sering kepentok limit:

### **1\. CoinGecko API (Free Tier vs Paid Tier)**

Di versi *Free Tier*, CoinGecko ngasih jatah **10.000 request per bulan** dan batasan kecepatan (*Rate Limit*) sekitar **5 sampai 30 request per menit** (tergantung kepadatan server mereka).

#### **PROS (Keuntungan Pakai Free Tier):**

* **Hemat Budget 100%:** Jelas banget, biaya operasional langsung pangkas jadi **Rp 0,-** alias gratis tis.  
* **Cukup untuk Data Santai:** Kalau data market makro (BTC & ETH) cuma ditarik berkala (misal tiap 10 atau 15 menit sekali via backend n8n), kuota 10.000 request sebulan itu **sangat amat sisa** untuk dipakai 5 orang user.

#### **CONS (Kerugian / Risiko Pakai Free Tier):**

* **Sering Kena Error 429 (Too Many Requests):** Ini penyakit utama *free tier*. Karena jalurnya dipakai barengan sama jutaan developer gratisan di seluruh dunia, dashboard lo bakal sering *error* atau datanya ga muncul (nge-blank) pas server CoinGecko lagi sibuk, walaupun kuota bulanan lo masih banyak.  
* **Data Sering Delay / Ga Akurat:** Prioritas data *real-time* dikasih ke user yang berbayar. Versi gratisan biasanya dapet data yang di-cache atau *delay* beberapa menit. Bahaya kalau si bos mau *fast-trade* atau mantau momentum *breakout*.  
* **Ga Ada Support / No SLA:** Kalau API mereka tiba-tiba mati atau *down* berjam-jam, agensi lo ga bisa komplain ke customer service mereka. Dashboard internal terpaksa ikut mati sampai server gratisan mereka bener sendiri.

### **2\. General Pro & Cons untuk Semua API Gratisan**

Biar lo bisa jelasin ke Pak Akbar kenapa beberapa API mending berbayar dan mana yang aman digratisin, ini rangkumannya:

#### **PROS (Pakai Free Tier):**

* Cocok banget buat **fase development / MVP awal** (nge-tes *logic codingan* di Google Antigravity atau n8n jalan atau kagak).  
* Resiko rugi bandar nol besar kalau ternyata project internal ini ga jadi dideploy atau si bos berubah pikiran di tengah jalan.

#### **CONS (Pakai Free Tier):**

* **Keamanan Kunci API Rendah:** Beberapa provider *free tier* ga ngasih fitur enkripsi atau enkapsulasi yang ketat, rawan bocor kalau sistem lo kegedean.  
* **Fitur Banyak Dikebiri:** Contohnya di CryptoPanic atau Twitter, versi gratisan ga bakal ngasih metadata sentimen, total likes, atau sorting data yang advanced. AI Claude bakal dapet teks mentah yang berantakan, bikin kerjaan analisa AI-nya jadi kurang akurat.

—------------------------------

Dalam file HTML yang ada saat ini, terdapat beberapa celah keamanan dan limitasi yang akan kami perbaiki pada tahap pengembangan backend:

* **Keamanan API Key (Urgent):** Saat ini request AI Claude ditembak langsung dari browser client-side. Ini berbahaya karena API Key Bapak bisa di-intip oleh orang lain via *Inspect Element*. **Solusi:** Kami akan memindahkan seluruh proses autentikasi API ke server backend agensi agar 100% aman.  
* **Optimalisasi Kuota Biaya (Caching System):** Jika dashboard di-refresh terus-menerus, biaya API X/Twitter dan Claude bisa membengkak. **Solusi:** Kami akan membuat sistem otomatisasi (Cron Job) yang menarik data setiap 3–5 minut sekali, menyimpannya di database lokal, dan mengaktifkan fitur *Prompt Caching* pada Claude untuk menghemat biaya input hingga 90%.

## **4\. Tahapan Kerja (Scope of Work)**

1. **Tahap 1: Setup Backend & Database Server** (Pembuatan sistem penampung data agar API Key aman).  
2. **Tahap 2: Integrasi & Caching API** (Menghubungkan DexScreener, Twitter Scraper, dan AI Claude secara stabil).  
3. **Tahap 3: Final UI Polish & Deployment** (Menghubungkan visual dashboard lama ke data server baru agar siap digunakan 24/7).

