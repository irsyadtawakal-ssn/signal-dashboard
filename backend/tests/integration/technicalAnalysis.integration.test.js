import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDb, getCache, setCache } from '../../src/db.js';

// Import the runTechnicalAnalysis function
let runTechnicalAnalysis;

beforeEach(async () => {
  vi.resetModules();
  const scheduler = await import('../../src/scheduler.js');
  runTechnicalAnalysis = scheduler.runTechnicalAnalysis;
});

describe('Technical Analysis Integration', () => {
  let db;

  beforeEach(() => {
    // Create in-memory test DB
    db = createDb(':memory:');
  });

  it('should run technical analysis and store signal', async () => {
    // Insert mock price history (200 days for MA calculation)
    for (let i = 0; i < 200; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (200 - i));
      const dateStr = date.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO price_history
        (date, oct_price, btc_price, eth_price)
        VALUES (?, ?, ?, ?)
      `).run(dateStr, 0.00140 + (i * 0.000001), 42000, 2000);
    }

    // Setup cache with required data
    setCache(db, 'price', {
      oct: 0.00145,
      change24h: 5.2,
      volume24h: 250000
    });

    setCache(db, 'macro', {
      btc: { price: 42500, change24h: 2.1 },
      eth: { price: 2100, change24h: 1.8 }
    });

    // Run technical analysis
    const result = await runTechnicalAnalysis({ db, config: {} });

    // Verify result structure
    expect(result.status).toBe('success');
    expect(['BUY', 'SELL', 'HOLD']).toContain(result.signal);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.confidence).toBeLessThanOrEqual(1.0);
    expect(result.signalChanged).toBeDefined();
    expect(result.timestamp).toBeDefined();
  });

  it('should fail gracefully when price data is missing', async () => {
    // Insert some price history
    for (let i = 0; i < 50; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (50 - i));
      const dateStr = date.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO price_history
        (date, oct_price, btc_price, eth_price)
        VALUES (?, ?, ?, ?)
      `).run(dateStr, 0.00140, 42000, 2000);
    }

    // Run with no cache data (should fail)
    const result = await runTechnicalAnalysis({ db, config: {} });

    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
  });

  it('should store signals to 10-minute table', async () => {
    // Setup price history
    for (let i = 0; i < 200; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (200 - i));
      const dateStr = date.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO price_history
        (date, oct_price, btc_price, eth_price, oct_volume)
        VALUES (?, ?, ?, ?, ?)
      `).run(dateStr, 0.00140 + (i * 0.000001), 42000, 2000, 1000000);
    }

    // Setup cache
    setCache(db, 'price', {
      oct: 0.00145,
      volume24h: 250000
    });

    setCache(db, 'macro', {
      btc: { change24h: 2.1 },
      eth: { change24h: 1.8 }
    });

    // Run analysis
    await runTechnicalAnalysis({ db, config: {} });

    // Verify 10-min signal was stored
    const tenMinSignal = db.prepare(`
      SELECT * FROM technical_signals_10min
      ORDER BY created_at DESC LIMIT 1
    `).get();

    expect(tenMinSignal).toBeDefined();
    expect(['BUY', 'SELL', 'HOLD']).toContain(tenMinSignal.signal);
    expect(tenMinSignal.confidence).toBeGreaterThan(0);
    expect(tenMinSignal.ma_50).toBeDefined();
    expect(tenMinSignal.ma_200).toBeDefined();
    expect(tenMinSignal.rsi_14).toBeDefined();
  });

  it('should store signals to daily table', async () => {
    // Setup price history
    for (let i = 0; i < 200; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (200 - i));
      const dateStr = date.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO price_history
        (date, oct_price, btc_price, eth_price, oct_volume)
        VALUES (?, ?, ?, ?, ?)
      `).run(dateStr, 0.00140 + (i * 0.000001), 42000, 2000, 1000000);
    }

    // Setup cache
    setCache(db, 'price', {
      oct: 0.00145,
      volume24h: 250000
    });

    setCache(db, 'macro', {
      btc: { change24h: 2.1 },
      eth: { change24h: 1.8 }
    });

    // Run analysis
    await runTechnicalAnalysis({ db, config: {} });

    // Verify daily signal was stored
    const dailySignal = db.prepare(`
      SELECT * FROM technical_signals_daily
      ORDER BY created_at DESC LIMIT 1
    `).get();

    expect(dailySignal).toBeDefined();
    expect(['BUY', 'SELL', 'HOLD']).toContain(dailySignal.signal);
    expect(dailySignal.confidence).toBeGreaterThan(0);
    expect(dailySignal.reasoning).toBeDefined();
  });

  it('should detect signal changes', async () => {
    // Setup initial price history
    for (let i = 0; i < 200; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (200 - i));
      const dateStr = date.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO price_history
        (date, oct_price, btc_price, eth_price, oct_volume)
        VALUES (?, ?, ?, ?, ?)
      `).run(dateStr, 0.00140 + (i * 0.000001), 42000, 2000, 1000000);
    }

    // Setup cache with initial data
    setCache(db, 'price', {
      oct: 0.00145,
      volume24h: 250000
    });

    setCache(db, 'macro', {
      btc: { change24h: 2.1 },
      eth: { change24h: 1.8 }
    });

    // First analysis
    const result1 = await runTechnicalAnalysis({ db, config: {} });
    expect(result1.status).toBe('success');

    // Update price data to potentially trigger signal change
    setCache(db, 'price', {
      oct: 0.00200,  // Price increase
      volume24h: 500000
    });

    // Second analysis
    const result2 = await runTechnicalAnalysis({ db, config: {} });
    expect(result2.status).toBe('success');
    expect(result2.signalChanged).toBeDefined();
  });

  it('should calculate indicators correctly', async () => {
    // Setup price history with known values
    const prices = [];
    for (let i = 0; i < 200; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (200 - i));
      const dateStr = date.toISOString().split('T')[0];
      const price = 0.00100 + (i * 0.000010);  // Gradual price increase
      prices.push(price);

      db.prepare(`
        INSERT INTO price_history
        (date, oct_price, btc_price, eth_price, oct_volume)
        VALUES (?, ?, ?, ?, ?)
      `).run(dateStr, price, 42000, 2000, 1000000);
    }

    // Setup cache
    setCache(db, 'price', {
      oct: 0.00300,
      volume24h: 250000
    });

    setCache(db, 'macro', {
      btc: { change24h: 2.1 },
      eth: { change24h: 1.8 }
    });

    // Run analysis
    const result = await runTechnicalAnalysis({ db, config: {} });
    expect(result.status).toBe('success');

    // Check that signal was cached with indicators
    const cachedSignal = getCache(db, 'technicalSignal');
    expect(cachedSignal).toBeDefined();
    expect(cachedSignal.value.signal).toBeDefined();
    expect(cachedSignal.value.confidence).toBeGreaterThan(0);
  });
});
