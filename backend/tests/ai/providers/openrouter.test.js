import { describe, it, expect, vi } from 'vitest';
import { createOpenRouterComplete } from '../../../src/ai/providers/openrouter.js';

function okResponse(content) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
}

describe('createOpenRouterComplete', () => {
  it('posts to the OpenRouter endpoint with auth, model, and a cacheable system prompt', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('[]'));
    const complete = createOpenRouterComplete({ apiKey: 'or-key', fetchFn });
    await complete({ system: 'SYS', user: 'USR' });

    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer or-key');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('anthropic/claude-sonnet-4.6');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(body.messages[0].content[0].text).toBe('SYS');
    expect(body.messages[1]).toEqual({ role: 'user', content: 'USR' });
  });

  it('returns the assistant message text', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('HELLO'));
    const complete = createOpenRouterComplete({ apiKey: 'k', fetchFn });
    expect(await complete({ system: 's', user: 'u' })).toBe('HELLO');
  });

  it('honors a model override', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('[]'));
    const complete = createOpenRouterComplete({ apiKey: 'k', fetchFn });
    await complete({ system: 's', user: 'u', model: 'anthropic/claude-opus-4.8' });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).model).toBe('anthropic/claude-opus-4.8');
  });

  it('throws on a non-ok response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    const complete = createOpenRouterComplete({ apiKey: 'k', fetchFn });
    await expect(complete({ system: 's', user: 'u' })).rejects.toThrow('429');
  });
});
