import { describe, it, expect, vi } from 'vitest';
import { classifyTweets } from '../../src/ai/sentiment.js';

const tweets = [
  { id: '1', text: 'OCT to the moon', author: 'a', url: 'u1', createdAt: 't1' },
  { id: '2', text: 'dumping my bags', author: 'b', url: 'u2', createdAt: 't2' },
  { id: '3', text: 'huge wallet just bought', author: 'c', url: 'u3', createdAt: 't3' },
];

describe('classifyTweets', () => {
  it('makes a single batched call and maps labels back by id', async () => {
    const complete = vi.fn().mockResolvedValue(
      '[{"id":"1","sentiment":"Bullish"},{"id":"2","sentiment":"Bearish"},{"id":"3","sentiment":"Whale"}]'
    );
    const result = await classifyTweets({ tweets, complete });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.map((t) => t.sentiment)).toEqual(['Bullish', 'Bearish', 'Whale']);
    expect(result[0]).toMatchObject({ id: '1', text: 'OCT to the moon' });
  });

  it('passes a system prompt and a user payload containing the tweets', async () => {
    const complete = vi.fn().mockResolvedValue('[]');
    await classifyTweets({ tweets, complete });
    const arg = complete.mock.calls[0][0];
    expect(typeof arg.system).toBe('string');
    expect(arg.system.length).toBeGreaterThan(0);
    expect(arg.user).toContain('OCT to the moon');
  });

  it('tolerates JSON wrapped in markdown fences', async () => {
    const complete = vi.fn().mockResolvedValue('```json\n[{"id":"1","sentiment":"Bullish"}]\n```');
    const result = await classifyTweets({ tweets: [tweets[0]], complete });
    expect(result[0].sentiment).toBe('Bullish');
  });

  it('falls back to Unrated for missing/invalid labels', async () => {
    const complete = vi.fn().mockResolvedValue('[{"id":"1","sentiment":"Nonsense"}]');
    const result = await classifyTweets({ tweets, complete });
    expect(result.map((t) => t.sentiment)).toEqual(['Unrated', 'Unrated', 'Unrated']);
  });

  it('falls back to Unrated (and does not throw) when complete rejects', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('api down'));
    const result = await classifyTweets({ tweets, complete });
    expect(result.map((t) => t.sentiment)).toEqual(['Unrated', 'Unrated', 'Unrated']);
  });

  it('returns [] without calling complete when there are no tweets', async () => {
    const complete = vi.fn();
    expect(await classifyTweets({ tweets: [], complete })).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });
});
