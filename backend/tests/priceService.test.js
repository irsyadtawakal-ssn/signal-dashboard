import { describe, it, expect, vi } from 'vitest';
import { buildPrice } from '../src/priceService.js';

describe('buildPrice', () => {
  it('merges oct + macro into one object with a timestamp', async () => {
    const dexFn = vi.fn().mockResolvedValue({ oct: 0.21, octChange24h: 5 });
    const macroFn = vi.fn().mockResolvedValue({ btc: 68000, btcChange24h: 1, eth: 3500, ethChange24h: -2 });
    const result = await buildPrice({ dexFn, macroFn });
    expect(result.oct).toBe(0.21);
    expect(result.btc).toBe(68000);
    expect(result.eth).toBe(3500);
    expect(typeof result.fetchedAt).toBe('number');
  });

  it('degrades: keeps macro when dex source fails', async () => {
    const dexFn = vi.fn().mockRejectedValue(new Error('dex down'));
    const macroFn = vi.fn().mockResolvedValue({ btc: 68000, btcChange24h: 1, eth: 3500, ethChange24h: -2 });
    const result = await buildPrice({ dexFn, macroFn });
    expect(result.oct).toBeNull();
    expect(result.btc).toBe(68000);
  });

  it('degrades: keeps oct when macro source fails', async () => {
    const dexFn = vi.fn().mockResolvedValue({ oct: 0.21, octChange24h: 5 });
    const macroFn = vi.fn().mockRejectedValue(new Error('cg down'));
    const result = await buildPrice({ dexFn, macroFn });
    expect(result.oct).toBe(0.21);
    expect(result.btc).toBeNull();
  });
});
