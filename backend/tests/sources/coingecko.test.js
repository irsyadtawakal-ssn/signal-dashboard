import { describe, it, expect, vi } from 'vitest';
import { fetchMacro } from '../../src/sources/coingecko.js';

describe('fetchMacro', () => {
  it('returns btc and eth prices with 24h change', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({
      bitcoin: { usd: 68000, usd_24h_change: 1.5 },
      ethereum: { usd: 3500, usd_24h_change: -2.1 },
    });
    const result = await fetchMacro({ getJsonFn });
    expect(getJsonFn).toHaveBeenCalledWith(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true',
      expect.any(Object)
    );
    expect(result).toEqual({
      btc: 68000, btcChange24h: 1.5,
      eth: 3500, ethChange24h: -2.1,
    });
  });

  it('throws when expected keys are missing', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({});
    await expect(fetchMacro({ getJsonFn })).rejects.toThrow(/coingecko/i);
  });
});
