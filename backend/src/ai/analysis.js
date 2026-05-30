const VALID = new Set(['BUY', 'HOLD', 'SELL']);

const SYSTEM_PROMPT = [
  'You are a senior crypto trading analyst for the token Octra (OCT).',
  'You are given JSON with the latest cached market data: { price, tweets, news }.',
  'Any field may be null if that data is temporarily unavailable — reason with what you have',
  'and note the gap in your summary.',
  'Produce ONE combined recommendation and per-component reasoning.',
  'Respond with ONLY a JSON object (no prose, no markdown), of the exact shape:',
  '{',
  '  "recommendation": "BUY|HOLD|SELL",',
  '  "confidence": <number 0..1>,',
  '  "summary": "<2-4 sentence narrative>",',
  '  "components": {',
  '    "priceAction": "<one line>",',
  '    "sentiment": "<one line>",',
  '    "twitterBuzz": "<one line>",',
  '    "movingAverage": "<one line>",',
  '    "fibonacci": "<one line>"',
  '  }',
  '}',
].join('\n');

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('no JSON object in analysis reply');
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Expected object but got ${typeof parsed}`);
    }
    return parsed;
  } catch (error) {
    throw new Error(`JSON parsing failed in analysis: ${error.message}. Input: ${text.slice(start, end + 1).substring(0, 100)}...`);
  }
}

async function analyzeMarket({ price, tweets, news, complete, model }) {
  const user = JSON.stringify({ price: price || null, tweets: tweets || null, news: news || null });
  const reply = await complete({ system: SYSTEM_PROMPT, user, model });
  const parsed = extractJsonObject(reply);

  if (!VALID.has(parsed.recommendation)) {
    throw new Error(`invalid recommendation: ${parsed.recommendation}`);
  }

  return {
    recommendation: parsed.recommendation,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    summary: parsed.summary || '',
    components: parsed.components || {},
  };
}

module.exports = { analyzeMarket, SYSTEM_PROMPT };
