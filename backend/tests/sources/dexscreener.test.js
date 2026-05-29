import { describe, it, expect, vi } from 'vitest';
import { fetchOctPrice } from '../../src/sources/dexscreener.js';

describe('fetchOctPrice', () => {
  const tokenAddress = '0xToken';

  it('calls the tokens endpoint with the token address and returns oct price', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({
      pairs: [{ priceUsd: '0.2134', priceChange: { h24: 5.2 } }],
    });
    const result = await fetchOctPrice({ getJsonFn, tokenAddress });
    expect(getJsonFn).toHaveBeenCalledWith(
      'https://api.dexscreener.com/latest/dex/tokens/0xToken',
      expect.any(Object)
    );
    expect(result).toEqual({ oct: 0.2134, octChange24h: 5.2 });
  });

  it('throws when there are no pairs', async () => {
    const getJsonFn = vi.fn().mockResolvedValue({ pairs: [] });
    await expect(fetchOctPrice({ getJsonFn, tokenAddress })).rejects.toThrow(/no pairs/i);
  });
});
