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

    // Defensive checks: validate response structure
    if (!msg.content || !Array.isArray(msg.content) || msg.content.length === 0) {
      throw new Error(`Anthropic API returned empty content array. Full response: ${JSON.stringify(msg)}`);
    }

    const textContent = msg.content.find(block => block && block.type === 'text');
    if (!textContent || !textContent.text) {
      const contentTypes = msg.content.map(c => c?.type || 'unknown').join(', ');
      throw new Error(`Anthropic API returned no text content. Content types: [${contentTypes}]`);
    }

    return textContent.text;
  };
}

module.exports = { createAnthropicComplete, DEFAULT_MODEL };
