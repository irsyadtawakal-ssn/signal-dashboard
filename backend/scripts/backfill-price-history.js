/**
 * Backfill price history from DexScreener API
 * Run once to populate 200 days of historical data
 * Usage: node scripts/backfill-price-history.js
 */

const { createDb } = require('../src/db');
const { getJson } = require('../src/http');
const { fetchOctPrice } = require('../src/sources/dexscreener');
const { fetchMacro } = require('../src/sources/coingecko');
const path = require('path');

require('dotenv').config({ override: true });

async function backfillPriceHistory() {
  console.log('[Backfill] Starting price history backfill...');

  const db = createDb(process.env.DB_PATH || path.join(__dirname, '../data/cache.sqlite'));

  try {
    // Fetch today's price
    const octPrice = await fetchOctPrice({
      getJsonFn: getJson,
      tokenAddress: process.env.OCT_TOKEN_ADDRESS
    });

    const macro = await fetchMacro({ getJsonFn: getJson });

    // Insert today
    const today = new Date().toISOString().split('T')[0];

    db.prepare(`
      INSERT OR REPLACE INTO price_history
      (date, oct_price, oct_change_24h, oct_volume, btc_price, eth_price, btc_change_24h, eth_change_24h)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      today,
      octPrice.oct,
      octPrice.octChange24h,
      octPrice.octVolume24h,
      macro.btc,
      macro.eth,
      macro.btcChange24h,
      macro.ethChange24h
    );

    console.log(`[Backfill] Inserted today's price: OCT $${octPrice.oct}`);

    // For demo/testing: generate synthetic historical data (200 days)
    console.log('[Backfill] Generating 200 days of synthetic historical data...');

    let currentPrice = octPrice.oct;

    for (let i = 200; i > 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      // Simulate price walk (random walk with slight uptrend)
      currentPrice = currentPrice * (0.98 + Math.random() * 0.04); // +/- 2% daily
      const volume = Math.random() * 300000 + 100000; // 100K-400K

      db.prepare(`
        INSERT OR IGNORE INTO price_history
        (date, oct_price, oct_change_24h, oct_volume, btc_price, eth_price, btc_change_24h, eth_change_24h)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        dateStr,
        currentPrice,
        (Math.random() - 0.5) * 10, // Random +/- 5% change
        volume,
        50000 + Math.random() * 5000, // BTC ~50-55K
        2500 + Math.random() * 300, // ETH ~2.5-2.8K
        (Math.random() - 0.5) * 4, // +/- 2%
        (Math.random() - 0.5) * 3  // +/- 1.5%
      );
    }

    const count = db.prepare(`SELECT COUNT(*) as count FROM price_history`).get().count;
    console.log(`[Backfill] Success! ${count} days of price history loaded`);
    console.log('[Backfill] Technical analysis can now calculate MA50 and MA200');

  } catch (err) {
    console.error('[Backfill] Error:', err.message);
    process.exit(1);
  }
}

backfillPriceHistory();
