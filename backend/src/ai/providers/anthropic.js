const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_MODEL = 'claude-sonnet-4-6';

function createAnthropicComplete({ apiKey, client = new Anthropic({ apiKey }), model = DEFAULT_MODEL }) {
  return async function complete({ system, user, model: modelOverride }) {
    const msg = await client.messages.create({
      model: modelOverride || model,
      max_tokens: 1024,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    });
    return msg.content[0].text;
  };
}

module.exports = { createAnthropicComplete, DEFAULT_MODEL };
