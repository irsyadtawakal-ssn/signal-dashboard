import { describe, it, expect, vi } from 'vitest';
import { createAnthropicComplete } from '../../../src/ai/providers/anthropic.js';

function mockClient(text) {
  return { messages: { create: vi.fn().mockResolvedValue({ content: [{ text }] }) } };
}

describe('createAnthropicComplete', () => {
  it('calls messages.create with model, a cacheable system block, and the user message', async () => {
    const client = mockClient('[]');
    const complete = createAnthropicComplete({ client });
    await complete({ system: 'SYS', user: 'USR' });

    const arg = client.messages.create.mock.calls[0][0];
    expect(arg.model).toBe('claude-sonnet-4-6');
    expect(arg.system).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }]);
    expect(arg.messages).toEqual([{ role: 'user', content: 'USR' }]);
    expect(arg.max_tokens).toBeGreaterThan(0);
  });

  it('returns the first text content block', async () => {
    const client = mockClient('HELLO');
    const complete = createAnthropicComplete({ client });
    expect(await complete({ system: 's', user: 'u' })).toBe('HELLO');
  });

  it('honors a model override', async () => {
    const client = mockClient('[]');
    const complete = createAnthropicComplete({ client });
    await complete({ system: 's', user: 'u', model: 'claude-opus-4-8' });
    expect(client.messages.create.mock.calls[0][0].model).toBe('claude-opus-4-8');
  });
});
