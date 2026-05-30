const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';

function createOpenRouterComplete({ apiKey, fetchFn = fetch, model = DEFAULT_MODEL }) {
  return async function complete({ system, user, model: modelOverride }) {
    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelOverride || model,
        messages: [
          { role: 'system', content: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenRouter request failed with status ${res.status}`);
    }
    const data = await res.json();

    // Defensive checks: validate response structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      const diagnostics = {
        choicesLength: data.choices?.length,
        hasChoices: !!data.choices,
        isArray: Array.isArray(data.choices),
      };
      throw new Error(`OpenRouter API returned empty choices array: ${JSON.stringify(diagnostics)}`);
    }

    const choice = data.choices[0];
    if (!choice.message || !choice.message.content) {
      const messageStructure = {
        hasMessage: !!choice.message,
        hasContent: !!choice.message?.content,
      };
      throw new Error(`OpenRouter API returned invalid message structure: ${JSON.stringify(messageStructure)}`);
    }

    return choice.message.content;
  };
}

module.exports = { createOpenRouterComplete, DEFAULT_MODEL };
